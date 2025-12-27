import { Injectable, Logger } from '@nestjs/common';
import { AsyncPostGateway, AsyncPollingJobData, AsyncPublishStatus } from './async-post.gateway';
import { PlatformAccountInfo } from './post-base.gateway';
import { PlatformType } from 'src/enums/platform-type.enum';
import { TweetsService } from 'src/tweets/tweets.service';
import { Rettiwt } from 'rettiwt-api';
import { TwitterApi } from 'twitter-api-v2';
import axios from 'axios';
import { isVideoFile, getMimeType } from '../utils/media-utils';
import { PlatformAnalyticsResponse } from 'src/graphql/types/analytics.type';

@Injectable()
export class XPostGateway extends AsyncPostGateway {
  private readonly logger = new Logger(XPostGateway.name);

  private twitterClient = new TwitterApi();
  private rettiwt: Rettiwt;
  constructor(private tweetsService: TweetsService) {
    super();
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
        media_type: mimeType as any,
      });

      this.logger.log(`[X] Uploaded media ID: ${mediaId}`);
      return mediaId;
    } catch (error: any) {
      this.logger.error(`[X] Media upload error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get analytics for a published tweet using rettiwt
   * @param platformPostId The tweet ID
   */
  async getPostAnalytics(platformPostId: string): Promise<PlatformAnalyticsResponse> {
    try {
      this.logger.log(`[X] Fetching analytics for tweet: ${platformPostId}`);

      const details = await this.rettiwt.tweet.details(platformPostId);

      if (!details) {
        throw new Error(`Tweet ${platformPostId} not found`);
      }

      return {
        views: details.viewCount || 0,
        likes: details.likeCount || 0,
        comments: details.replyCount || 0,
        shares: details.retweetCount || 0,
        rawMetrics: {
          bookmarkCount: details.bookmarkCount,
          quoteCount: details.quoteCount,
        },
      };
    } catch (error: any) {
      this.logger.error(`[X] Analytics fetch error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get X/Twitter user info including follower count
   * Uses rettiwt to fetch user profile
   * @param username Twitter username (without @)
   */
  async getAccountInfo(username: string): Promise<PlatformAccountInfo> {
    try {
      this.logger.log(`[X] Fetching user info for: ${username}`);

      const user = await this.rettiwt.user.details(username);

      if (!user) {
        throw new Error(`Twitter user ${username} not found`);
      }

      return {
        displayName: user.fullName || user.userName,
        username: user.userName,
        followerCount: user.followersCount || 0,
        followingCount: user.followingsCount || 0,
        profilePictureUrl: user.profileImage,
      };
    } catch (error: any) {
      this.logger.error(`[X] User info fetch error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check publish status for X posts
   * X posts are instant, so this always returns PUBLISHED
   */
  async checkPublishStatus(
    postId: string,
    access_token: string,
  ): Promise<AsyncPublishStatus> {
    // X posts are published instantly - no processing delay
    return {
      status: 'PUBLISHED',
      postId: postId,
      postUrl: `https://twitter.com/i/status/${postId}`,
    };
  }

  /**
   * Get polling job data for X posts
   * Returns null since X posts complete instantly and don't need async polling
   */
  getPollingJobData(
    publishedPost: any,
    result: any,
    access_token: string,
    metadata: Record<string, any>,
  ): AsyncPollingJobData | null {
    // X posts are instant - no polling needed
    return null;
  }

  /**
   * Complete publish for X posts
   * X posts are already complete after createNewPost, just return the URL
   */
  async completePublish(
    postId: string,
    access_token: string,
    metadata: Record<string, any>,
  ): Promise<{ postId?: string; postUrl?: string }> {
    return {
      postId: postId,
      postUrl: `https://twitter.com/i/status/${postId}`,
    };
  }
}

