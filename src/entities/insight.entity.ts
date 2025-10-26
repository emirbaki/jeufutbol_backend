import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import {
  ObjectType,
  Field,
  ID,
  Float,
  registerEnumType,
} from '@nestjs/graphql';
import { User } from './user.entity';
import { Tweet } from './tweet.entity';
import { GraphQLJSON } from 'graphql-type-json';

export enum InsightType {
  TRENDING_TOPIC = 'trending_topic',
  CONTENT_SUGGESTION = 'content_suggestion',
  ENGAGEMENT_PATTERN = 'engagement_pattern',
  OPTIMAL_POSTING_TIME = 'optimal_posting_time',
  AUDIENCE_INTEREST = 'audience_interest',
}

// Register enum for GraphQL schema
registerEnumType(InsightType, {
  name: 'InsightType',
  description: 'Types of insights generated from analyzed tweets or profiles',
});

@ObjectType()
@Entity('insights')
export class Insight {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field(() => String)
  @Column({ type: 'uuid' })
  userId: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  sourceTweetId?: string;

  @Field(() => InsightType)
  @Column({ type: 'enum', enum: InsightType })
  type: InsightType;

  @Field()
  @Column()
  title: string;

  @Field()
  @Column({ type: 'text' })
  description: string;

  @Field(() => GraphQLJSON, { nullable: true })
  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @Field(() => Float)
  @Column({ type: 'float', default: 0 })
  relevanceScore: number;

  @Field()
  @Column({ default: false })
  isRead: boolean;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;

  // --- RELATIONS ---

  @Field(() => User)
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Field(() => Tweet, { nullable: true })
  @ManyToOne(() => Tweet, (tweet) => tweet.insights, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sourceTweetId' })
  sourceTweet?: Tweet;
}
