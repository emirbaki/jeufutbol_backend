import { InputType, Field } from '@nestjs/graphql';
import {
  IsArray,
  IsDateString,
  IsISO8601,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import GraphQLJSON from 'graphql-type-json';
import { TikTokPostSettingsInput } from '../types/tiktok.type';

@InputType()
export class CreatePostInput {
  @Field()
  @IsString()
  content: string;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  mediaUrls: string[];

  @Field(() => [String])
  @IsArray()
  targetPlatforms: string[];

  @Field(() => GraphQLJSON, { nullable: true })
  @IsOptional()
  platformSpecificContent: Record<string, any>;

  @IsOptional()
  @IsISO8601()
  @IsDateString()
  @Field(() => String, { nullable: true })
  scheduledFor: Date | null;

  @Field(() => TikTokPostSettingsInput, { nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => TikTokPostSettingsInput)
  tiktokSettings?: TikTokPostSettingsInput;
}
