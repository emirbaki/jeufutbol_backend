import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { ObjectType, Field, ID, Int } from '@nestjs/graphql';
import { MonitoredProfile } from './monitored-profile.entity';
import { Insight } from './insight.entity';
import { Tenant } from './tenant.entity';

@ObjectType()
@Entity('tweets')
export class Tweet {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field(() => String)
  @Column({ type: 'uuid' })
  monitoredProfileId: string;

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

  // --- RELATIONS ---

  @Field(() => MonitoredProfile)
  @ManyToOne(() => MonitoredProfile, (profile) => profile.tweets, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'monitoredProfileId' })
  monitoredProfile: MonitoredProfile;

  @Field(() => [Insight], { nullable: true })
  @OneToMany(() => Insight, (insight: Insight) => insight.sourceTweet)
  insights?: Insight;

  @Field(() => String, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;
}
