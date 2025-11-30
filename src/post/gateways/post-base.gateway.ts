import { PlatformType } from 'src/enums/platform-type.enum';

export abstract class PostGateway {
  abstract notifyPostPublished(
    postId: string,
    platform: PlatformType,
    publishedPostData: any,
  ): Promise<void>;

  abstract notifyPostScheduled(
    postId: string,
    scheduledFor: string,
  ): Promise<void>;

  abstract notifyPostFailed(postId: string, error: string): Promise<void>;

  abstract createNewPost(
    userId: string,
    content: string,
    access_token: string,
    media?: any,
    options?: any,
  ): Promise<any>;
}
