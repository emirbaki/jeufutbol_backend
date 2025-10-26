import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PostGateway } from './post-base.gateway';
import { PlatformType } from 'src/entities/social-account.entity';

@Injectable()
export class TiktokPostGateway implements PostGateway {
  private readonly logger = new Logger(TiktokPostGateway.name);

  async notifyPostPublished(
    postId: string,
    platform: PlatformType,
    publishedPostData: any,
  ): Promise<void> {
    this.logger.log(`[TikTok] Video published: ${postId}`);
  }

  async notifyPostScheduled(postId: string, scheduledFor: Date): Promise<void> {
    this.logger.log(`[TikTok] Video scheduled for: ${scheduledFor}`);
  }

  async notifyPostFailed(postId: string, error: string): Promise<void> {
    this.logger.error(`[TikTok] Video failed: ${error}`);
  }

  /**
   * @param userId TikTok user open_id
   * @param content Video caption
   * @param media { videoUrl: string }
   */
  async createNewPost(
    userId: string,
    content: string,
    access_token: string,
    media: { videoUrl: string },
  ): Promise<any> {
    try {

      // Step 1: Initialize upload session
      const initRes = await axios.post(
        'https://open-api.tiktok.com/v2/post/publish/content/init/',
        {
          open_id: userId,
          text: content,
          post_mode: 'PUBLISH',
        },
        { headers: { Authorization: `Bearer ${access_token}` } },
      );

      const { upload_url, publish_id } = initRes.data.data;

      // Step 2: Upload the video binary
      const videoBuffer = await axios.get(media.videoUrl, {
        responseType: 'arraybuffer',
      });
      await axios.put(upload_url, videoBuffer.data, {
        headers: { 'Content-Type': 'video/mp4' },
      });

      // Step 3: Finalize publishing
      const publishRes = await axios.post(
        'https://open-api.tiktok.com/v2/post/publish/content/complete/',
        { publish_id },
        { headers: { Authorization: `Bearer ${access_token}` } },
      );

      this.logger.log(
        `[TikTok] Video published successfully: ${publishRes.data.data?.id}`,
      );

      return publishRes.data.data;
    } catch (err: any) {
      await this.notifyPostFailed('unknown', err.message);
      throw err;
    }
  }
}
