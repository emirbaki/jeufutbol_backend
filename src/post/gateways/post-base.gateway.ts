import { PlatformType } from 'src/enums/platform-type.enum';
import { PlatformAnalyticsResponse } from 'src/graphql/types/analytics.type';

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

  /**
   * Get analytics for a published post
   * Override in subclasses that support analytics
   */
  getPostAnalytics?(
    platformPostId: string,
    accessToken?: string,
  ): Promise<PlatformAnalyticsResponse>;
}

