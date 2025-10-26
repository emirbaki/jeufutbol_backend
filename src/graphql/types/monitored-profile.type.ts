import { ObjectType, Field, ID } from '@nestjs/graphql';

@ObjectType()
export class MonitoredProfileType {
  @Field(() => ID)
  id: string;

  @Field()
  xUsername: string;

  @Field()
  xUserId: string;

  @Field({ nullable: true })
  displayName?: string;

  @Field({ nullable: true })
  profileImageUrl?: string;

  @Field()
  isActive: boolean;

  @Field({ nullable: true })
  lastFetchedAt?: Date;

  @Field()
  createdAt: Date;
}

@ObjectType()
export class TweetType {
  @Field(() => ID)
  id: string;

  @Field()
  tweetId: string;

  @Field()
  content: string;

  @Field()
  createdAt: Date;

  @Field()
  likes: number;

  @Field()
  retweets: number;

  @Field()
  replies: number;

  @Field()
  views: number;

  @Field(() => [String], { nullable: true })
  mediaUrls?: string[];

  @Field(() => [String], { nullable: true })
  hashtags?: string[];

  @Field(() => [String], { nullable: true })
  mentions?: string[];

  @Field(() => [String], { nullable: true })
  urls?: string[];

  @Field()
  fetchedAt: Date;
}
