import { Injectable, Logger } from '@nestjs/common';
import { PostGateway } from './post-base.gateway';
import { PlatformType } from 'src/entities/social-account.entity';
import { TweetsService } from 'src/tweets/tweets.service';
import { Rettiwt } from 'rettiwt-api';
import { TwitterApi } from 'twitter-api-v2';
import fetch from 'node-fetch';
import axios from 'axios';
// import fs from 'fs';
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

  async notifyPostScheduled(postId: string, scheduledFor: Date): Promise<void> {
    this.logger.log(`[X] Tweet scheduled for: ${scheduledFor.toISOString()}`);
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
      if (media !== undefined && media.length > 4) {
        this.logger.log(`[X] A tweet only can have 4 images:`);
      }

      if (media && media.length > 0) {
        // upload up to 4 media items sequentially
        const toUpload = media.slice(0, 4);
        for (const mediaString of toUpload) {
          // const mediaBuffer = fs.readFileSync(mediaString);
          const fileType =
            mediaString.endsWith('.jpg') || mediaString.endsWith('.jpeg')
              ? 'image/jpeg'
              : 'video/mp4';
          this.logger.log(`[X] media type: ${fileType}`);

          const downStream = await axios({
            method: 'GET',
            responseType: 'arraybuffer',
            url: mediaString,
          }).catch((error) => {
            this.logger.error('Download failed:', error);
            throw error; // better throw than silently send in your context
          });

          const buffer = Buffer.from(downStream.data);

          this.logger.log(`[X] buffered media size: ${buffer.byteLength}`);

          const res = await this.twitterClient.v1.uploadMedia(buffer, {
            mimeType: fileType,
          });

          this.logger.log(`[X] Uploaded media ID: ${res}`);
          uploadStrings.push(res);
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
      await this.notifyPostFailed('unknown', err.detail || err.response);
      throw err;
    }
  }
}
