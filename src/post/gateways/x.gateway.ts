import { Injectable, Logger } from '@nestjs/common';
import { PostGateway } from './post-base.gateway';
import { PlatformType } from 'src/enums/platform-type.enum';
import { TweetsService } from 'src/tweets/tweets.service';
import { Rettiwt } from 'rettiwt-api';
import { TwitterApi } from 'twitter-api-v2';
import axios from 'axios';
import { isVideoFile, getMimeType } from '../utils/media-utils';
@Injectable()
export class XPostGateway implements PostGateway {
  private readonly logger = new Logger(XPostGateway.name);

  private twitterClient = new TwitterApi();
  private rettiwt: Rettiwt;
  constructor(private tweetsService: TweetsService) {
    this.rettiwt = tweetsService.rettiwt;
  }

  async notifyPostPublished(
    postId: string,
    platform: PlatformType,
    publishedPostData: any,
  ): Promise<void> {
    this.logger.log(`[X] Tweet published: ${postId}`);
  }

  async notifyPostScheduled(
    postId: string,
    scheduledFor: string,
  ): Promise<void> {
    this.logger.log(`[X] Tweet scheduled for: ${scheduledFor}`);
  }

  async notifyPostFailed(postId: string, error: string): Promise<void> {
    this.logger.error(`[X] Tweet failed: ${error}`);
  }

  async createNewPost(
    userId: string,
    content: string,
    access_token: string,
    media?: string[],
  ): Promise<any> {
    try {
      this.twitterClient = new TwitterApi(access_token);
      const uploadStrings: string[] = [];

      // Twitter supports max 4 images OR 1 video (not mixed)
      if (media && media.length > 0) {
        // Detect if any media is video
        const hasVideo = media.some((url) => isVideoFile(url));

        if (hasVideo) {
          // Video upload - only upload the first video
          if (media.length > 1) {
            this.logger.warn(
              `[X] Only one video allowed per tweet. Using first video only.`,
            );
          }
          const videoUrl = media.find((url) => isVideoFile(url));
          if (videoUrl) {
            const mediaId = await this.uploadMedia(videoUrl);
            uploadStrings.push(mediaId);
          }
        } else {
          // Image upload - up to 4 images
          const imagesToUpload = media.slice(0, 4);
          if (media.length > 4) {
            this.logger.warn(
              `[X] Maximum 4 images allowed per tweet. Using first 4 images.`,
            );
          }

          for (const imageUrl of imagesToUpload) {
            const mediaId = await this.uploadMedia(imageUrl);
            uploadStrings.push(mediaId);
          }
        }
      }

      const payload: any = { text: content };
      if (uploadStrings.length > 0) {
        payload.media = { media_ids: uploadStrings };
      }

      const _post = await this.twitterClient.v2.tweet(payload);
      const details = await this.rettiwt.tweet.details(_post.data.id);

      this.logger.log(`[X] Tweet created successfully: ${_post.data.id}`);
      return { id: _post.data.id, url: details?.url };
    } catch (err: any) {
      this.logger.error(
        '[X] Tweet failed:',
        JSON.stringify(err, Object.getOwnPropertyNames(err), 2),
      );
      await this.notifyPostFailed(
        'unknown',
        err.detail || err.message || JSON.stringify(err),
      );
      throw err;
    }
  }

  /**
   * Upload media (image or video) to Twitter
   */
  private async uploadMedia(mediaUrl: string): Promise<string> {
    try {
      const mimeType = getMimeType(mediaUrl);
      this.logger.log(`[X] Uploading media: ${mediaUrl} (${mimeType})`);

      // Download media
      const downStream = await axios({
        method: 'GET',
        responseType: 'arraybuffer',
        url: mediaUrl,
      }).catch((error) => {
        this.logger.error(`[X] Download failed for ${mediaUrl}:`, error.message);
        throw new Error(`Failed to download media: ${error.message}`);
      });

      const buffer = Buffer.from(downStream.data);
      const fileSizeBytes = buffer.byteLength;
      const fileSizeMB = (fileSizeBytes / (1024 * 1024)).toFixed(2);

      this.logger.log(`[X] Media size: ${fileSizeMB}MB`);

      // Validate file size
      const isVideo = isVideoFile(mediaUrl);
      const maxSizeBytes = isVideo ? 512 * 1024 * 1024 : 5 * 1024 * 1024; // 512MB for video, 5MB for images

      if (fileSizeBytes > maxSizeBytes) {
        const maxSizeMB = maxSizeBytes / (1024 * 1024);
        throw new Error(
          `File size (${fileSizeMB}MB) exceeds Twitter's ${maxSizeMB}MB limit for ${isVideo ? 'videos' : 'images'}`,
        );
      }

      // Upload to Twitter
      const mediaId = await this.twitterClient.v2.uploadMedia(buffer, {
        type: mimeType,
      } as any);

      this.logger.log(`[X] Uploaded media ID: ${mediaId}`);
      return mediaId;
    } catch (error: any) {
      this.logger.error(`[X] Media upload error: ${error.message}`);
      throw error;
    }
  }
}
