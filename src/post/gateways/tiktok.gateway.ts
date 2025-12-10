import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { AsyncPostGateway, AsyncPollingJobData, AsyncPublishStatus } from './async-post.gateway';
import { PlatformType } from 'src/enums/platform-type.enum';
import { isVideoFile, getMediaType } from '../utils/media-utils';
import { TikTokCreatorInfo, TikTokPostSettingsInput } from 'src/graphql/types/tiktok.type';

const TIKTOK_API_BASE = 'https://open.tiktokapis.com';

/**
 * Extended options for TikTok posting with user-selected settings
 */
export interface TikTokPostOptions {
  username?: string;
  tiktokSettings?: TikTokPostSettingsInput;
}

@Injectable()
export class TiktokPostGateway extends AsyncPostGateway {
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
   * Get creator info from TikTok API
   * Required by TikTok Content Sharing Guidelines to fetch posting restrictions
   * @param access_token OAuth access token
   */
  async getCreatorInfo(access_token: string): Promise<TikTokCreatorInfo> {
    try {
      this.logger.log('[TikTok] Fetching creator info...');

      const response = await axios.post(
        `${TIKTOK_API_BASE}/v2/post/publish/creator_info/query/`,
        {},
        {
          headers: {
            Authorization: `Bearer ${access_token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const data = response.data.data;
      this.logger.log(`[TikTok] Creator info: ${JSON.stringify(data, null, 2)}`);

      return {
        creator_nickname: data.creator_nickname || '',
        creator_avatar_url: data.creator_avatar_url || '',
        privacy_level_options: data.privacy_level_options || [],
        max_video_post_duration_sec: data.max_video_post_duration_sec || 600,
        comment_disabled: data.comment_disabled || false,
        duet_disabled: data.duet_disabled || false,
        stitch_disabled: data.stitch_disabled || false,
      };
    } catch (err: any) {
      this.logger.error(
        `[TikTok] Failed to fetch creator info: ${JSON.stringify(err.response?.data, null, 2) || err.message}`,
      );
      throw err;
    }
  }


  /**
   * Create TikTok post (video or photo)
   * @param userId TikTok user open_id (not used directly, obtained from token)
   * @param content Video/Photo caption
   * @param access_token OAuth access token
   * @param media Array of media URLs (videos or images)
   * @param options TikTok-specific options including user-selected settings
   */
  async createNewPost(
    userId: string,
    content: string,
    access_token: string,
    media?: string[],
    options?: TikTokPostOptions,
  ): Promise<any> {
    try {
      if (!media || media.length === 0) {
        throw new Error(
          'TikTok requires at least one media file (image or video)',
        );
      }

      // Detect media type from first file
      const firstMediaUrl = media[0];
      const isVideo = isVideoFile(firstMediaUrl);

      if (isVideo) {
        // Handle video post
        return await this.publishVideo(
          content,
          access_token,
          firstMediaUrl,
          options,
        );
      } else {
        // Handle photo post (supports up to 35 images)
        return await this.publishPhotos(
          content,
          access_token,
          media.slice(0, 35),
          options,
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
   * Uses user-selected settings when available, falls back to SELF_ONLY for unaudited apps
   */
  private async publishVideo(
    caption: string,
    access_token: string,
    videoUrl: string,
    options?: TikTokPostOptions,
  ): Promise<any> {
    try {
      this.logger.log('[TikTok] Starting video upload...');

      const settings = options?.tiktokSettings;

      // Use user settings or fallback to SELF_ONLY (works for unaudited apps)
      const privacyLevel = settings?.privacy_level || 'SELF_ONLY';
      const disableComment = settings ? !settings.allow_comment : false;
      const disableDuet = settings ? !settings.allow_duet : false;
      const disableStitch = settings ? !settings.allow_stitch : false;
      const brandOrganic = settings?.is_brand_organic ?? false;
      const brandContent = settings?.is_branded_content ?? false;

      this.logger.log(`[TikTok] Post settings: privacy=${privacyLevel}, comment=${!disableComment}, duet=${!disableDuet}, stitch=${!disableStitch}`);

      // Step 1: Initialize video upload
      const initRes = await axios.post(
        `${TIKTOK_API_BASE}/v2/post/publish/video/init/`,
        {
          post_info: {
            title: caption,
            privacy_level: privacyLevel,
            disable_duet: disableDuet,
            disable_comment: disableComment,
            disable_stitch: disableStitch,
            video_cover_timestamp_ms: 1000,
            brand_organic_toggle: brandOrganic,
            brand_content_toggle: brandContent,
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

      // Return immediately with publish_id for async polling
      return {
        id: publish_id,
        url: null, // URL will be set by polling processor
        publish_id: publish_id,
      };
    } catch (err: any) {
      this.logger.error(
        `[TikTok] Video upload error: ${JSON.stringify(err.response?.data, null, 2) || err.message}`,
      );
      throw err;
    }
  }

  /**
   * Publish photos to TikTok (photo posts)
   * Uses user-selected settings when available, falls back to SELF_ONLY for unaudited apps
   */
  private async publishPhotos(
    caption: string,
    access_token: string,
    imageUrls: string[],
    options?: TikTokPostOptions,
  ): Promise<any> {
    try {
      this.logger.log(
        `[TikTok] Starting photo post with ${imageUrls.length} images...`,
      );
      this.logger.log(`[TikTok] Image URLs: ${JSON.stringify(imageUrls)}`);

      const settings = options?.tiktokSettings;

      // Use user settings or fallback to SELF_ONLY (works for unaudited apps)
      const privacyLevel = settings?.privacy_level || 'SELF_ONLY';
      const disableComment = settings ? !settings.allow_comment : false;
      const brandOrganic = settings?.is_brand_organic ?? false;
      const brandContent = settings?.is_branded_content ?? false;

      this.logger.log(`[TikTok] Photo post settings: privacy=${privacyLevel}, comment=${!disableComment}`);

      // Step 1: Initialize photo post
      const payload = {
        post_info: {
          title: caption,
          description: caption,
          privacy_level: privacyLevel,
          disable_comment: disableComment,
          auto_add_music: true,
          brand_organic_toggle: brandOrganic,
          brand_content_toggle: brandContent,
        },
        source_info: {
          source: 'PULL_FROM_URL',
          photo_cover_index: 0,
          photo_images: imageUrls,
        },
        post_mode: 'DIRECT_POST',
        media_type: 'PHOTO',
      };

      this.logger.log(`[TikTok] Payload: ${JSON.stringify(payload, null, 2)}`);

      const initRes = await axios.post(
        `${TIKTOK_API_BASE}/v2/post/publish/content/init/`,
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

      // Return immediately with publish_id for async polling
      return {
        id: publish_id,
        url: null, // URL will be set by polling processor
        publish_id: publish_id,
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
   * Check publish status once (called by background job processor)
   * Returns status data for the polling processor to handle
   */
  async checkPublishStatus(
    publish_id: string,
    access_token: string,
  ): Promise<AsyncPublishStatus> {
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

      const statusData = statusRes.data.data;

      // Log full response for debugging
      this.logger.log(
        `[TikTok] Full status response: ${JSON.stringify(statusRes.data, null, 2)}`,
      );

      this.logger.log(
        `[TikTok] Status check for ${publish_id}: ${statusData.status}`,
      );

      // TikTok API has a typo: "publicaly_available_post_id" (one 'L')
      // Check both spellings to be safe
      const postIds =
        statusData.publicaly_available_post_id || // TikTok's typo (one L)
        statusData.publicly_available_post_id ||  // Correct spelling (two L's)
        [];

      // If complete, construct the final URL
      let postUrl: string | undefined = undefined;
      if (statusData.status === 'PUBLISH_COMPLETE' && postIds.length > 0) {
        // Note: We'll get username and mediaType from job metadata
        // For now, just return the postId
        postUrl = undefined; // Will be constructed by processor using metadata
      }

      return {
        status: statusData.status,
        postId: postIds.length > 0 ? postIds[0] : undefined,
        postUrl: postUrl,
        failReason: statusData.fail_reason,
      };
    } catch (error: any) {
      this.logger.error(
        `[TikTok] Status check error: ${error.response?.data || error.message}`,
      );
      throw error;
    }
  }

  /**
   * Complete the publish for TikTok - construct final URL
   * TikTok doesn't need a separate publish API call, but we need to construct the URL
   */
  async completePublish(
    publishId: string,
    access_token: string,
    metadata: Record<string, any>,
  ): Promise<{ postId?: string; postUrl?: string }> {
    const username = metadata.username;
    const mediaType = metadata.mediaType || 'video';
    const postId = metadata.postId; // Should be set by processor from status check

    if (!username) {
      this.logger.warn('[TikTok] Missing username in metadata, cannot construct URL');
      return {};
    }

    // If no postId (API not approved for public posts), return profile URL only
    if (!postId) {
      const profileUrl = `https://www.tiktok.com/@${username}`;
      this.logger.log(
        `[TikTok] No public post ID available (API not approved). Using profile URL: ${profileUrl}`,
      );
      return {
        postUrl: profileUrl,
      };
    }

    // Construct the final URL with post ID
    const urlPath = mediaType === 'video' ? 'video' : 'photo';
    const postUrl = `https://www.tiktok.com/@${username}/${urlPath}/${postId}`;

    this.logger.log(`[TikTok] Constructed post URL: ${postUrl}`);

    return {
      postId: postId,
      postUrl: postUrl,
    };
  }

  /**
   * Get polling job data for TikTok async uploads
   */
  getPollingJobData(
    publishedPost: any,
    result: any,
    access_token: string,
    metadata: Record<string, any>,
  ): AsyncPollingJobData | null {
    // Only create polling job if publish_id is present
    if (!result.publish_id) {
      return null;
    }

    // Determine media type from first media URL
    const mediaType = metadata.mediaUrls && metadata.mediaUrls.length > 0
      ? getMediaType(metadata.mediaUrls[0])
      : 'image';

    return {
      publishedPostId: publishedPost.id,
      publish_id: result.publish_id,
      access_token: access_token,
      platform: PlatformType.TIKTOK,
      metadata: {
        username: metadata.username || 'user',
        mediaType: mediaType,
      },
    };
  }

  /**
   * Helper delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
