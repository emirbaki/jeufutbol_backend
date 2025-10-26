import { ObjectType, Field, ID, registerEnumType } from '@nestjs/graphql';
import { PostStatus } from '../../entities/post.entity';
import { GraphQLJSONObject } from 'graphql-type-json';

registerEnumType(PostStatus, {
  name: 'PostStatus',
});

@ObjectType()
export class PostType {
  @Field(() => ID)
  id: string;

  @Field()
  content: string;

  @Field(() => [String], { nullable: true })
  mediaUrls?: string[];

  @Field(() => GraphQLJSONObject, { nullable: true })
  platformSpecificContent?: Record<string, any>;

  @Field(() => PostStatus)
  status: PostStatus;

  @Field(() => [String])
  targetPlatforms: string[];

  @Field({ nullable: true })
  scheduledFor?: Date;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;
}

@ObjectType()
export class PublishedPostType {
  @Field(() => ID)
  id: string;

  @Field()
  platform: string;

  @Field()
  platformPostId: string;

  @Field()
  platformPostUrl: string;

  @Field()
  publishedAt: Date;
}
