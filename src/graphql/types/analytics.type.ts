import { ObjectType, Field, Int, Float } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-type-json';

/**
 * Raw post analytics data from database
 */
@ObjectType()
export class PostAnalyticsType {
    @Field()
    id: string;

    @Field()
    publishedPostId: string;

    @Field()
    platform: string;

    @Field(() => Int)
    views: number;

    @Field(() => Int)
    likes: number;

    @Field(() => Int)
    comments: number;

    @Field(() => Int)
    shares: number;

    @Field(() => Int, { nullable: true })
    reach?: number;

    @Field(() => Int, { nullable: true })
    saves?: number;

    @Field(() => Float, { nullable: true })
    engagementRate?: number;

    @Field(() => GraphQLJSON, { nullable: true })
    rawMetrics?: Record<string, any>;

    @Field()
    fetchedAt: Date;
}

/**
 * Published post data
 */
@ObjectType()
export class PublishedPostType {
    @Field()
    id: string;

    @Field()
    postId: string;

    @Field()
    platform: string;

    @Field()
    platformPostId: string;

    @Field()
    platformPostUrl: string;

    @Field()
    publishedAt: Date;

    @Field({ nullable: true })
    content?: string;
}

/**
 * Analytics settings for a tenant
 */
@ObjectType()
export class AnalyticsSettingsType {
    @Field()
    id: string;

    @Field()
    tenantId: string;

    @Field(() => Int)
    refreshIntervalHours: number;

    @Field({ nullable: true })
    lastRefreshAt?: Date;
}

/**
 * Raw analytics data response - frontend handles aggregation and formatting
 */
@ObjectType()
export class RawAnalyticsDataType {
    @Field(() => [PostAnalyticsType])
    analytics: PostAnalyticsType[];

    @Field(() => [PublishedPostType])
    publishedPosts: PublishedPostType[];

    @Field(() => AnalyticsSettingsType)
    settings: AnalyticsSettingsType;
}

// Interface for platform gateway analytics response (internal use)
export interface PlatformAnalyticsResponse {
    views: number;
    likes: number;
    comments: number;
    shares: number;
    reach?: number;
    saves?: number;
    rawMetrics?: Record<string, any>;
}
