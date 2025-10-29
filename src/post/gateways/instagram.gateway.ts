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

      if (CAROUSEL_OR_SINGLE === 'IMAGE') {
        // Step 2: Publish the single media container
        const publish = await axios
          .post(`${GRAPH_API_BASE}/${accountID}/media_publish`, 
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

        const postUrl = await axios.get(`https://graph.instagram.com/v24.0/${publish.data.id}`,
          {
            params: {
              fields: 'media_url',
              access_token: access_token,
            },
          },
        );

        return { id: publish.data.id, url: postUrl.data.media_url };
      }
    } catch (err: any) {
      await this.notifyPostFailed('unknown', err.message);
      throw err;
    }
  }
}
