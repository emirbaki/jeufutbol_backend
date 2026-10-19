import { Field, Int, ObjectType } from '@nestjs/graphql';
import { Post } from '../../entities/post.entity';

@ObjectType()
export class PostPage {
  @Field(() => [Post])
  items: Post[];

  /** All posts that match the filter, not only this page. */
  @Field(() => Int)
  total: number;
}

@ObjectType()
export class PostStatusCounts {
  @Field(() => Int)
  all: number;

  @Field(() => Int)
  published: number;

  @Field(() => Int)
  scheduled: number;

  @Field(() => Int)
  draft: number;

  @Field(() => Int)
  failed: number;
}
