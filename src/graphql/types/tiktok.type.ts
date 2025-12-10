import { Field, ObjectType, InputType, Int } from '@nestjs/graphql';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

/**
 * TikTok Creator Info - returned from TikTok's creator_info API
 * Used to get posting restrictions and options for a specific creator
 */
@ObjectType()
export class TikTokCreatorInfo {
    @Field()
    creator_nickname: string;

    @Field()
    creator_avatar_url: string;

    @Field(() => [String])
    privacy_level_options: string[];

    @Field(() => Int)
    max_video_post_duration_sec: number;

    @Field()
    comment_disabled: boolean;

    @Field()
    duet_disabled: boolean;

    @Field()
    stitch_disabled: boolean;
}

/**
 * TikTok Post Settings - user-selected options for posting
 * These are required by TikTok's Content Sharing Guidelines
 */
@InputType()
export class TikTokPostSettingsInput {
    @Field({ nullable: true })
    @IsString()
    @IsOptional()
    title?: string; // TikTok post title (caption)

    @Field()
    @IsString()
    privacy_level: string; // Must be one of: PUBLIC_TO_EVERYONE, MUTUAL_FOLLOW_FRIENDS, SELF_ONLY, FOLLOWER_OF_CREATOR

    @Field()
    @IsBoolean()
    allow_comment: boolean;

    @Field()
    @IsBoolean()
    allow_duet: boolean;

    @Field()
    @IsBoolean()
    allow_stitch: boolean;

    @Field({ defaultValue: false })
    @IsBoolean()
    @IsOptional()
    is_brand_organic?: boolean; // "Your brand" - Promotional content label

    @Field({ defaultValue: false })
    @IsBoolean()
    @IsOptional()
    is_branded_content?: boolean; // "Branded content" - Paid partnership label
}

