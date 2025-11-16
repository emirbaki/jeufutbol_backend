import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PostGateway } from './post-base.gateway';
import { PlatformType } from 'src/entities/social-account.entity';

const TIKTOK_API_BASE = 'https://open.tiktokapis.com';

@Injectable()
export class TiktokPostGateway implements PostGateway {
  private readonly logger = new Logger(TiktokPostGateway.name);

  async notifyPostPublished(
    postId: string,
    platform: PlatformType,
    publishedPostData: any,
  ): Promise<void> {
    this.logger.log(`[TikTok] Content published: ${postId}`);
  }

  async notifyPostScheduled(
    postId: string,
    scheduledFor: string,
  ): Promise<void> {
    this.logger.log(`[TikTok] Content scheduled for: ${scheduledFor}`);
  }

  async notifyPostFailed(postId: string, error: string): Promise<void> {
    this.logger.error(`[TikTok] Content failed: ${error}`);
  }

  /**
   * Create TikTok post (video or photo)
   * @param userId TikTok user open_id (not used directly, obtained from token)
   * @param content Video/Photo caption
   * @param access_token OAuth access token
   * @param media Array of media URLs (videos or images)
   */
  async createNewPost(
    userId: string,
    content: string,
    access_token: string,
    media?: string[],
  ): Promise<any> {
    try {
      if (!media || media.length === 0) {
        throw new Error(
          'TikTok requires at least one media file (image or video)',
        );
      }

      // Detect media type from first file
      const firstMediaUrl = media[0];
      const isVideo = this.isVideoFile(firstMediaUrl);

      if (isVideo) {
        // Handle video post
        return await this.publishVideo(content, access_token, firstMediaUrl);
      } else {
        // Handle photo post (supports up to 35 images)
        return await this.publishPhotos(
          content,
          access_token,
          media.slice(0, 35),
        );
      }
    } catch (err: any) {
      this.logger.error(`[TikTok] Publishing failed: ${err.message}`);
      await this.notifyPostFailed('unknown', err.message);
      throw err;
    }
  }

  /**
   * Publish video to TikTok
   */
  private async publishVideo(
    caption: string,
    access_token: string,
    videoUrl: string,
  ): Promise<any> {
    try {
      this.logger.log('[TikTok] Starting video upload...');

      // Step 1: Initialize video upload
      const initRes = await axios.post(
        `${TIKTOK_API_BASE}/v2/post/publish/video/init/`,
        {
          post_info: {
            title: caption,
            privacy_level: 'SELF_ONLY', // Options: PUBLIC_TO_EVERYONE, MUTUAL_FOLLOW_FRIENDS, SELF_ONLY
            disable_duet: false,
            disable_comment: false,
            disable_stitch: false,
            video_cover_timestamp_ms: 1000,
          },
          source_info: {
            source: 'PULL_FROM_URL',
            video_url: videoUrl,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${access_token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const { publish_id } = initRes.data.data;
      this.logger.log(`[TikTok] Video upload initialized: ${publish_id}`);

      // Step 2: Check upload status (poll until complete)
      await this.pollUploadStatus(publish_id, access_token);

      this.logger.log(`[TikTok] Video published successfully: ${publish_id}`);

      return {
        id: publish_id,
        url: `https://www.tiktok.com/@user/video/${publish_id}`, // Approximate URL
      };
    } catch (err: any) {
      this.logger.error(
        `[TikTok] Video upload error: ${err.response?.data || err.message}`,
      );
      throw err;
    }
  }

  /**
   * Publish photos to TikTok (photo posts)
   */
  private async publishPhotos(
    caption: string,
    access_token: string,
    imageUrls: string[],
  ): Promise<any> {
    try {
      this.logger.log(
        `[TikTok] Starting photo post with ${imageUrls.length} images...`,
      );
      this.logger.log(`[TikTok] Image URLs: ${JSON.stringify(imageUrls)}`);

      // Step 1: Initialize photo post
      const payload = {
        post_info: {
          title: caption,
          privacy_level: 'SELF_ONLY',
          disable_comment: false,
          auto_add_music: true,
        },
        source_info: {
          source: 'PULL_FROM_URL',
          photo_cover_index: 0,
          photo_images: imageUrls.map((url) => ({ image_url: url })),
        },
        post_mode: 'DIRECT_POST', // Add this
        media_type: 'PHOTO', // Add this
      };

      this.logger.log(`[TikTok] Payload: ${JSON.stringify(payload, null, 2)}`);

      const initRes = await axios.post(
        `${TIKTOK_API_BASE}/v2/post/publish/content/init/`, // Changed endpoint
        payload,
        {
          headers: {
            Authorization: `Bearer ${access_token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      this.logger.log(
        `[TikTok] Init response: ${JSON.stringify(initRes.data, null, 2)}`,
      );

      const { publish_id } = initRes.data.data;
      this.logger.log(`[TikTok] Photo post initialized: ${publish_id}`);

      // Step 2: Check upload status
      await this.pollUploadStatus(publish_id, access_token);

      this.logger.log(
        `[TikTok] Photo post published successfully: ${publish_id}`,
      );

      return {
        id: publish_id,
        url: `https://www.tiktok.com/@user/video/${publish_id}`,
      };
    } catch (err: any) {
      const errorDetails = {
        message: err.message,
        status: err.response?.status,
        statusText: err.response?.statusText,
        data: err.response?.data,
        url: err.config?.url,
        method: err.config?.method,
      };

      this.logger.error(
        `[TikTok] Photo upload error: ${JSON.stringify(errorDetails, null, 2)}`,
      );
      throw err;
    }
  }

  /**
   * Poll upload status until complete or failed
   */
  private async pollUploadStatus(
    publish_id: string,
    access_token: string,
    maxAttempts: number = 30,
  ): Promise<void> {
    const DELAY_MS = 2000; // 2 seconds between checks

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await this.delay(DELAY_MS);

      this.logger.log(
        `[TikTok] Checking status (${attempt + 1}/${maxAttempts})...`,
      );

      try {
        const statusRes = await axios.post(
          `${TIKTOK_API_BASE}/v2/post/publish/status/fetch/`,
          { publish_id },
          {
            headers: {
              Authorization: `Bearer ${access_token}`,
              'Content-Type': 'application/json',
            },
          },
        );

        const status = statusRes.data.data.status;
        this.logger.log(`[TikTok] Upload status: ${status}`);

        if (status === 'PUBLISH_COMPLETE') {
          return; // Success!
        }

        if (status === 'FAILED') {
          throw new Error(
            `Upload failed: ${statusRes.data.data.fail_reason || 'Unknown error'}`,
          );
        }

        // Status is still PROCESSING_UPLOAD, continue polling
      } catch (error: any) {
        this.logger.error(`[TikTok] Status check error: ${error.message}`);
        throw error;
      }
    }

    throw new Error(
      `Upload timed out after ${(maxAttempts * DELAY_MS) / 1000} seconds`,
    );
  }

  /**
   * Determine if file is video based on URL
   */
  private isVideoFile(url: string): boolean {
    const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v'];
    const lowerUrl = url.toLowerCase();
    return videoExtensions.some((ext) => lowerUrl.includes(ext));
  }

  /**
   * Helper delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
