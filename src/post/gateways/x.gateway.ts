import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PostGateway } from './post-base.gateway';
import { PlatformType } from 'src/entities/social-account.entity';

@Injectable()
export class XPostGateway implements PostGateway {
  private readonly logger = new Logger(XPostGateway.name);

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
    media?: any,
  ): Promise<any> {
    try {
      const res = await axios.post(
        'https://api.x.com/2/tweets',
        { text: content },
        { headers: { Authorization: `Bearer ${access_token}` } },
      );

      this.logger.log(`[X] Tweet created successfully: ${res.data.data?.id}`);
      return res.data.data;
    } catch (err: any) {
      await this.notifyPostFailed('unknown', err.message);
      throw err;
    }
  }
}
