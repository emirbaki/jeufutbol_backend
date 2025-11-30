import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { AsyncPostGateway, AsyncPollingJobData, AsyncPublishStatus } from './async-post.gateway';
import { PlatformType } from 'src/enums/platform-type.enum';
import { isVideoFile, getMediaType } from '../utils/media-utils';

const GRAPH_API_BASE = 'https://graph.instagram.com/v24.0';

@Injectable()
export class InstagramPostGateway extends AsyncPostGateway {
  private readonly logger = new Logger(InstagramPostGateway.name);

  async notifyPostPublished(
    postId: string,
    platform: PlatformType,
    publishedPostData: any,
  ): Promise<void> {
    this.logger.log(`[Instagram] Post published: ${postId}`);
  }

  async notifyPostScheduled(
    postId: string,
    scheduledFor: string,
  ): Promise<void> {
    this.logger.log(`[Instagram] Post scheduled for: ${scheduledFor}`);
  }

  async notifyPostFailed(postId: string, error: string): Promise<void> {
    this.logger.error(`[Instagram] Post failed: ${error}`);
  }
  /**
   * @param userId Instagram Business Account ID
   * @param content Caption text
   * @param media { url: string }
   */
  async createNewPost(
    userId: string,
    content: string,
    access_token: string,
    media?: string[],
  ): Promise<any> {
    try {
      const containerIds: string[] = [];
      const accountID_response = await axios
        .get(`https://graph.instagram.com/v24.0/me`, {
          params: {
            fields: 'user_id',
            access_token: access_token,
          },
        })
        .catch((err) => {
          this.logger.error(
            `[Instagram] Error fetching account ID: ${err.message}`,
          );
          throw err;
        });
      const accountID = accountID_response.data.user_id;

      // Detect if media contains videos
      const hasVideo = media?.some((url) => isVideoFile(url)) || false;

      if (hasVideo) {
        // Instagram doesn't support mixed media (video + images)
        // If there's a video, only process the first video as a Reel
        const videoUrl = media!.find((url) => isVideoFile(url));

        if (media!.length > 1) {
          this.logger.warn(
            `[Instagram] Mixed media or multiple videos not supported. Using first video as Reel.`,
          );
        }

        return await this.publishReelAsync(
          accountID,
          videoUrl!,
          content,
          access_token,
        );
      }

      // Image post flow (existing carousel/single image logic)
      //creating multiple media containers for carousel posts or single media post
      for (const url of media!) {
        this.logger.log(`[Instagram] Media URL: ${accountID}`);
        this.logger.log(`[Instagram] Media URL: ${url}`);
        this.logger.log(`[Instagram] Access Token: ${access_token}`);
        const mediaContainer = await axios
          .post(
            `${GRAPH_API_BASE}/${accountID}/media`,
            {
              image_url: url,
              caption: content,
            },
            {
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${access_token}`,
              },
            },
          )
          .catch((err) => {
            const errortext = JSON.stringify(err.toJSON());
            const req = err.request;
            this.logger.error('Request:', req && req._header);
            this.logger.error(
              `[Instagram] Error creating media container first: ${errortext || err.message}`,
            );
            throw err;
          });
        this.logger.log(
          `[Instagram] Media Container ID: ${mediaContainer.data.id}`,
        );
        containerIds.push(mediaContainer.data.id);
      }
      const CAROUSEL_OR_SINGLE = containerIds.length > 1 ? 'CAROUSEL' : 'IMAGE';

      await this.pollMediaContainerStatus(
        containerIds.join(','),
        access_token,
        this.logger,
      );

      if (CAROUSEL_OR_SINGLE === 'IMAGE') {
        // Step 2: Publish the single media container
        const publish = await axios
          .post(
            `${GRAPH_API_BASE}/${accountID}/media_publish`,
            {
              // access_token: access_token,
              creation_id: containerIds.join(','),
              caption: content,
            },
            {
              headers: {
                'Content-Type': 'application/json',
                // 'Content-Length': 0,
                Accept: '*/*',
                'Accept-Encoding': 'gzip, deflate, br',
                Authorization: `Bearer ${access_token}`,
              },
            },
          )
          .catch((err) => {
            const errortext = JSON.stringify(err.toJSON());
            const req = err.request;
            this.logger.error('Request:', req && req._header);
            this.logger.error(
              `[Instagram] Error publishing media carousel container second: ${errortext || err.message}`,
            );
            throw err;
          });

        this.logger.log(
          `[Instagram] Media published successfully: ${publish.data.id}`,
        );

        const postUrl = await axios.get(
          `https://graph.instagram.com/v24.0/${publish.data.id}`,
          {
            params: {
              fields: 'permalink',
              access_token: access_token,
            },
          },
        );
        await new Promise((resolve, reject) => {
          setTimeout(() => resolve('Promise is resolved'), 1000);
        });
        return { id: publish.data.id, url: postUrl.data.permalink };
      } else {
        // Step 2: Create a media container
        const mediaCreation = await axios
          .post(
            `${GRAPH_API_BASE}/${accountID}/media`,
            {
              children: containerIds.join(','),
              caption: content,
              media_type: CAROUSEL_OR_SINGLE,
            },
            {
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${access_token}`,
              },
            },
          )
          .catch((err) => {
            const errortext = JSON.stringify(err.toJSON());
            const req = err.request;
            this.logger.error('Request:', req && req._header);
            this.logger.error(
              `[Instagram] Error creating media carousel container second: ${errortext || err.message}`,
            );
            throw err;
          });
        this.logger.log(
          `[Instagram] Media Carousel Container ID: ${mediaCreation.data.id}`,
        );
        // Step 2: Publish the media container
        const publish = await axios.post(
          `${GRAPH_API_BASE}/${accountID}/media_publish`,
          {
            creation_id: mediaCreation.data.id,
            // caption: content,
          },
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${access_token}`,
            },
          },
        );

        this.logger.log(
          `[Instagram] Media published successfully: ${publish.data.id}`,
        );

        const postUrl = await axios.get(
          `https://graph.instagram.com/v24.0/${publish.data.id}`,
          {
            params: {
              fields: 'permalink',
              access_token: access_token,
            },
          },
        );
        await new Promise((resolve, reject) => {
          setTimeout(() => resolve('Promise is resolved'), 1000);
        });

        return { id: publish.data.id, url: postUrl.data.permalink };
      }
    } catch (err: any) {
      await this.notifyPostFailed('unknown', err.message);
      throw err;
    }
  }

  /**
   * Synchronous polling for image containers (images process quickly)
   * Only used for non-video posts
   */
  private async pollMediaContainerStatus(
    containerId: string,
    accessToken: string,
    logger: any,
  ): Promise<void> {
    const MAX_ATTEMPTS = 12;
    const DELAY_MS = 5000;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
      }

      logger.log(
        `[Instagram] Polling status for ${containerId}. Attempt ${attempt + 1}/${MAX_ATTEMPTS}`,
      );

      try {
        const statusResponse = await axios.get(
          `${GRAPH_API_BASE}/${containerId}`,
          {
            params: {
              fields: 'status_code',
              access_token: accessToken,
            },
          },
        );

        const statusCode = statusResponse.data.status_code;

        if (statusCode === 'FINISHED') {
          logger.log(
            `[Instagram] Container ${containerId} status is FINISHED. Ready to publish.`,
          );
          return;
        }

        if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
          throw new Error(
            `Media container ${containerId} failed processing with status: ${statusCode}.`,
          );
        }
      } catch (error: any) {
        logger.error(
          `[Instagram] Polling failed for ${containerId}: ${error.message}`,
        );
        throw error;
      }
    }

    throw new Error(
      `Media container ${containerId} timed out after ${(MAX_ATTEMPTS * DELAY_MS) / 1000} seconds. Status still IN_PROGRESS.`,
    );
  }

  /**
   * Check publish status for Instagram Reels (async polling)
   */
  async checkPublishStatus(
    containerId: string,
    access_token: string,
  ): Promise<AsyncPublishStatus> {
    try {
      const statusResponse = await axios.get(
        `${GRAPH_API_BASE}/${containerId}`,
        {
          params: {
            fields: 'status_code',
            access_token: access_token,
          },
        },
      );

      const statusCode = statusResponse.data.status_code;

      this.logger.log(
        `[Instagram] Container ${containerId} status: ${statusCode}`,
      );

      return {
        status: statusCode, // FINISHED, IN_PROGRESS, ERROR, EXPIRED
        postId: undefined, // Will be set after publishing
        postUrl: undefined, // Will be set after publishing
        failReason: statusCode === 'ERROR' || statusCode === 'EXPIRED' ? 'Container processing failed' : undefined,
      };
    } catch (error: any) {
      this.logger.error(
        `[Instagram] Status check error for ${containerId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Publish a video as Instagram Reel (async - returns container ID for polling)
   */
  private async publishReelAsync(
    accountID: string,
    videoUrl: string,
    caption: string,
    access_token: string,
  ): Promise<any> {
    try {
      this.logger.log(`[Instagram] Creating Reel container with video: ${videoUrl}`);

      // Step 1: Create video container
      const mediaContainer = await axios
        .post(
          `${GRAPH_API_BASE}/${accountID}/media`,
          {
            media_type: 'REELS',
            video_url: videoUrl,
            caption: caption,
            share_to_feed: false, // Set to true if you want Reel to appear in feed
          },
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${access_token}`,
            },
          },
        )
        .catch((err) => {
          const errortext = JSON.stringify(err.toJSON());
          const req = err.request;
          this.logger.error('Request:', req && req._header);
          this.logger.error(
            `[Instagram] Error creating video container: ${errortext || err.message}`,
          );
          throw err;
        });

      const containerId = mediaContainer.data.id;
      this.logger.log(`[Instagram] Video Container ID: ${containerId} - will poll asynchronously`);

      // Return container ID for async polling
      return {
        id: containerId,
        url: null, // Will be set by polling processor
        publish_id: containerId, // Container ID is the publish_id
        accountID: accountID, // Store for later publishing
      };
    } catch (err: any) {
      this.logger.error(`[Instagram] Reel container creation failed: ${err.message}`);
      throw err;
    }
  }

  /**
   * Get polling job data for Instagram Reels async uploads
   */
  getPollingJobData(
    publishedPost: any,
    result: any,
    access_token: string,
    metadata: Record<string, any>,
  ): AsyncPollingJobData | null {
    // Only create polling job if publish_id (container ID) is present
    if (!result.publish_id) {
      return null;
    }

    return {
      publishedPostId: publishedPost.id,
      publish_id: result.publish_id,
      access_token: access_token,
      platform: PlatformType.INSTAGRAM,
      metadata: {
        accountID: result.accountID,
        mediaType: 'video',
      },
    };
  }

}
