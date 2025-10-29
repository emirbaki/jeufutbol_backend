import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PostGateway } from './post-base.gateway';
import { PlatformType } from 'src/entities/social-account.entity';

const GRAPH_API_BASE = 'https://graph.instagram.com/v24.0';

@Injectable()
export class InstagramPostGateway implements PostGateway {
  private readonly logger = new Logger(InstagramPostGateway.name);

  async notifyPostPublished(
    postId: string,
    platform: PlatformType,
    publishedPostData: any,
  ): Promise<void> {
    this.logger.log(`[Instagram] Post published: ${postId}`);
  }

  async notifyPostScheduled(postId: string, scheduledFor: Date): Promise<void> {
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
    media: string[],
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
      //creating multiple media containers for carousel posts or single media post
      for (const url of media) {
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
              fields: 'media_url',
              access_token: access_token,
            },
          },
        );
        await new Promise((resolve, reject) => {
          setTimeout(() => resolve('Promise is resolved'), 1000);
        });
        return { id: publish.data.id, url: postUrl.data.media_url };
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
              fields: 'media_url',
              access_token: access_token,
            },
          },
        );
        await new Promise((resolve, reject) => {
          setTimeout(() => resolve('Promise is resolved'), 1000);
        });

        return { id: publish.data.id, url: postUrl.data.media_url };
      }
    } catch (err: any) {
      await this.notifyPostFailed('unknown', err.message);
      throw err;
    }
  }

  /**
   * Polls the Instagram Graph API to check the processing status of a media container.
   * Throws an error if the container fails processing or times out.
   * * @param containerId The ID of the media container (child or parent carousel).
   * @param accessToken The access token.
   * @param logger Your logging instance (e.g., this.logger in NestJS).
   */
  async pollMediaContainerStatus(
    containerId: string,
    accessToken: string,
    logger: any,
  ): Promise<void> {
    const MAX_ATTEMPTS = 12; // Max wait time of 60 seconds (12 * 5s)
    const DELAY_MS = 5000;
    const GRAPH_API_BASE = 'https://graph.instagram.com/v24.0'; // Define if not globally available

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      // 1. Wait 5 seconds before the check
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
      }

      logger.log(
        `[Instagram] Polling status for ${containerId}. Attempt ${attempt + 1}/${MAX_ATTEMPTS}`,
      );

      try {
        // 2. GET the container status
        const statusResponse = await axios.get(
          `${GRAPH_API_BASE}/${containerId}`, // Note: using the containerId here
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
          return; // Exit successfully!
        }

        if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
          throw new Error(
            `Media container ${containerId} failed processing with status: ${statusCode}.`,
          );
        }

        // If IN_PROGRESS, loop again
      } catch (error) {
        logger.error(
          `[Instagram] Polling failed for ${containerId}: ${error.message}`,
        );
        // Re-throw if it's a critical error (like token expiry)
        throw error;
      }
    }

    throw new Error(
      `Media container ${containerId} timed out after ${(MAX_ATTEMPTS * DELAY_MS) / 1000} seconds. Status still IN_PROGRESS.`,
    );
  }
}
