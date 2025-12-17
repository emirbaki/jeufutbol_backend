import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { ObjectType, Field, ID, Int } from '@nestjs/graphql';
import { Insight } from './insight.entity';
import { TweetMonitoredProfile } from './tweet-monitored-profile.entity';

@ObjectType()
@Entity('tweets')
export class Tweet {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column({ unique: true })
  tweetId: string;

  @Field()
  @Column({ type: 'text' })
  content: string;

  @Field()
  @Column()
  createdAt: Date;

  @Field(() => Int)
  @Column({ default: 0 })
  likes: number;

  @Field(() => Int)
  @Column({ default: 0 })
  retweets: number;

  @Field(() => Int)
  @Column({ default: 0 })
  replies: number;

  @Field(() => Int)
  @Column({ default: 0 })
  views: number;

  @Field(() => [String], { nullable: true })
  @Column({ type: 'jsonb', nullable: true })
  mediaUrls?: string[];

  @Field(() => [String], { nullable: true })
  @Column({ type: 'jsonb', nullable: true })
  hashtags?: string[];

  @Field(() => [String], { nullable: true })
  @Column({ type: 'jsonb', nullable: true })
  mentions?: string[];

  @Field(() => [String], { nullable: true })
  @Column({ type: 'jsonb', nullable: true })
  urls?: string[];

  @Field(() => String, {
    nullable: true,
    description: 'Raw tweet data (JSON as object)',
  })
  @Column({ type: 'jsonb', nullable: true })
  rawData?: Record<string, any>;

  @Field(() => Boolean)
  @Column({ default: false })
  isIndexedInVector: boolean;

  @Field()
  @CreateDateColumn()
  fetchedAt: Date;

  /**
   * Optional field - populated for timeline queries to help frontend
   * match the tweet with the correct monitored profile.
   * Not stored in DB, attached dynamically by service.
   */
  @Field(() => String, { nullable: true })
  monitoredProfileId?: string;

  // --- RELATIONS ---

  @Field(() => [Insight], { nullable: true })
  @OneToMany(() => Insight, (insight: Insight) => insight.sourceTweet)
  insights?: Insight[];

  /**
   * Many-to-many relationship with MonitoredProfiles via junction table.
   * A tweet can be linked to multiple monitored profiles when different
   * tenants monitor the same Twitter user.
   */
  @OneToMany(
    () => TweetMonitoredProfile,
    (tmp) => tmp.tweet,
  )
  tweetMonitoredProfiles?: TweetMonitoredProfile[];
}
