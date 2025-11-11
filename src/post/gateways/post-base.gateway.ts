import { PlatformType } from 'src/entities/social-account.entity';

export abstract class PostGateway {
  abstract notifyPostPublished(
    postId: string,
    platform: PlatformType,
    publishedPostData: any,
  ): Promise<void>;

  abstract notifyPostScheduled(
    postId: string,
    scheduledFor: Date,
  ): Promise<void>;

  abstract notifyPostFailed(postId: string, error: string): Promise<void>;

  abstract createNewPost(
    userId: string,
    content: string,
    access_token: string,
    media?: any,
  ): Promise<any>;
}
