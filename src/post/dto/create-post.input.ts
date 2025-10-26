import { InputType, Field } from '@nestjs/graphql';
import { PlatformType } from '../../entities/social-account.entity';
import GraphQLJSON from 'graphql-type-json';
import { IsArray, IsDateString, IsOptional, IsString } from 'class-validator';

@InputType()
export class CreatePostInput {
  @Field()
  @IsString()
  content: string;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mediaUrls?: string[];

  @Field(() => [String])
  @IsArray()
  @IsString({ each: true })
  targetPlatforms: PlatformType[];

  @Field(() => GraphQLJSON, { nullable: true })
  @IsOptional()
  platformSpecificContent?: Record<string, any>; // JSON serialized

  @Field({ nullable: true })
  @IsOptional()
  @IsDateString()
  scheduledFor?: Date;
}
