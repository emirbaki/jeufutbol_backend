import { Injectable, Logger } from '@nestjs/common';
import { PostGateway } from './post-base.gateway';
import { PlatformType } from 'src/entities/social-account.entity';
import { TweetsService } from 'src/tweets/tweets.service';
import { Rettiwt } from 'rettiwt-api';
import { TwitterApi } from 'twitter-api-v2';
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
          const fileType = mediaString.match('.jpg') ? 'image/jpeg' : 'video/mp4';
          this.logger.log(`[X] media type: ${fileType}`);
          const response = await fetch(mediaString);
          const buffer = await response.arrayBuffer();
          // this.twitterClient.v2.uploadMedia()
          const res = await this.twitterClient.v2.uploadMedia(
            Buffer.from(buffer),
            {
              media_type: fileType,
            },
          );
          uploadStrings.push(res);
        }
      }

      const payload: any = { text: content };
      if (uploadStrings.length > 0) {
        payload.media = { media_ids: uploadStrings };
      }
      const _post = await this.twitterClient.v2.tweet(payload);
      const details = await this.rettiwt.tweet.details(_post.data.id);
      // const post = await this.rettiwt.tweet.post({
      //   text: content,
      //   media: uploadStrings.map((val) => {
      //     return { id: val };
      //   }),
      // });

      this.logger.log(`[X] Tweet created successfully: ${_post.data.id}`);
      return { id: _post.data.id, url: details?.url };
    } catch (err: any) {
      await this.notifyPostFailed('unknown', err.message);
      throw err;
    }
  }
}
