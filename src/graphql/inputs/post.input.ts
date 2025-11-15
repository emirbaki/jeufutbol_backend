import { InputType, Field } from '@nestjs/graphql';
import { IsISO8601, IsOptional } from 'class-validator';
import GraphQLJSON, { GraphQLJSONObject } from 'graphql-type-json';

@InputType()
export class CreatePostInput {
  @Field()
  content: string;

  @Field(() => [String], { nullable: true })
  mediaUrls: string[];

  @Field(() => [String])
  targetPlatforms: string[];

  @Field(() => GraphQLJSON, { nullable: true })
  platformSpecificContent: Record<string, any>;

  @IsOptional()
  @IsISO8601()
  @Field({ nullable: true })
  scheduledFor: string | null;
}

@InputType()
export class UpdatePostInput {
  @Field({ nullable: true })
  content?: string;

  @Field(() => [String], { nullable: true })
  mediaUrls?: string[];

  @Field(() => GraphQLJSONObject, { nullable: true })
  platformSpecificContent?: Record<string, any>;

  @Field(() => [String], { nullable: true })
  targetPlatforms?: string[];

  @Field({ nullable: true })
  scheduledFor?: Date;
}
