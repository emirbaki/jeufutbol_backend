import { PlatformType } from 'src/enums/platform-type.enum';
import { PlatformAnalyticsResponse } from 'src/graphql/types/analytics.type';

/**
 * Account info response for follower counts
 */
export interface PlatformAccountInfo {
  displayName: string;
  username?: string;
  followerCount: number;
  followingCount?: number;
  profilePictureUrl?: string;
  mediaCount?: number;
}

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

  /**
   * Get account info including follower count
   * Override in subclasses that support account info retrieval
   */
  getAccountInfo?(
    accountIdOrToken: string,
    accessToken?: string,
  ): Promise<PlatformAccountInfo>;
}

