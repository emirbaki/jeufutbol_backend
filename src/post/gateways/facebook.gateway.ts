import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PostGateway } from './post-base.gateway';
import { PlatformType } from 'src/entities/social-account.entity';

const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';

@Injectable()
export class FacebookPostGateway implements PostGateway {
  private readonly logger = new Logger(FacebookPostGateway.name);

  async notifyPostPublished(
    postId: string,
    platform: PlatformType,
    publishedPostData: any,
  ): Promise<void> {
    this.logger.log(`Post published on Facebook: ${postId}`);
  }

  async notifyPostScheduled(postId: string, scheduledFor: Date): Promise<void> {
    this.logger.log(`Facebook post scheduled for ${scheduledFor}`);
  }

  async notifyPostFailed(postId: string, error: string): Promise<void> {
    this.logger.error(`Facebook post failed: ${error}`);
  }

  async createNewPost(
    userId: string,
    content: string,
    access_token: string,
    media?: string[],
  ): Promise<any> {
    const response = await axios.post(`${GRAPH_API_BASE}/${userId}/feed`, {
      message: content,
      access_token: access_token,
    });

    return response.data;
  }
}
