import { InputType, Field } from '@nestjs/graphql';
import { GraphQLJSONObject } from 'graphql-type-json';

@InputType()
export class CreatePostInput {
  @Field()
  content: string;

  @Field(() => [String], { nullable: true })
  mediaUrls?: string[];

  @Field(() => GraphQLJSONObject, { nullable: true })
  platformSpecificContent?: Record<string, any>;

  @Field(() => [String])
  targetPlatforms: string[];

  @Field({ nullable: true })
  scheduledFor?: Date;
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
