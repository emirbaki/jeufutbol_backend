import { Field, ObjectType, InputType, Int } from '@nestjs/graphql';
import { IsBoolean, IsOptional, IsString, IsArray } from 'class-validator';

/**
 * YouTube Channel Info - returned from YouTube's channels API
 * Used to get channel details for the authenticated user
 */
@ObjectType()
export class YouTubeChannelInfo {
    @Field()
    channel_id: string;

    @Field()
    channel_title: string;

    @Field({ nullable: true })
    channel_thumbnail?: string;

    @Field(() => Int, { nullable: true })
    subscriber_count?: number;
}

/**
 * YouTube Post Settings - user-selected options for posting
 * Note: Video description comes from the main post content field
 */
@InputType()
export class YouTubePostSettingsInput {
    @Field()
    @IsString()
    title: string; // Required: Video title (max 100 chars)

    @Field({ defaultValue: 'public' })
    @IsString()
    privacy_status: string; // 'public' | 'private' | 'unlisted' - default public

    @Field({ nullable: true })
    @IsString()
    @IsOptional()
    category_id?: string; // YouTube category (e.g., "22" for People & Blogs)

    @Field(() => [String], { nullable: true })
    @IsArray()
    @IsOptional()
    tags?: string[]; // Video tags

    @Field({ defaultValue: false })
    @IsBoolean()
    @IsOptional()
    is_short?: boolean; // Mark as YouTube Short (auto-detected based on duration/aspect)

    @Field({ defaultValue: false })
    @IsBoolean()
    @IsOptional()
    made_for_kids?: boolean; // COPPA compliance - required field

    @Field({ defaultValue: false })
    @IsBoolean()
    @IsOptional()
    notify_subscribers?: boolean; // Send notification to subscribers
}

