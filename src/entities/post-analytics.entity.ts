import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
    Index,
} from 'typeorm';
import { ObjectType, Field, ID, Float, Int } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-type-json';
import { PublishedPost } from './published-post.entity';
import { PlatformType } from '../enums/platform-type.enum';

@ObjectType()
@Entity('post_analytics')
export class PostAnalytics {
    @Field(() => ID)
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Field()
    @Column({ type: 'uuid' })
    @Index()
    publishedPostId: string;

    @Field(() => String)
    @Column({ type: 'enum', enum: PlatformType })
    platform: PlatformType;

    @Field(() => Int)
    @Column({ type: 'int', default: 0 })
    views: number;

    @Field(() => Int)
    @Column({ type: 'int', default: 0 })
    likes: number;

    @Field(() => Int)
    @Column({ type: 'int', default: 0 })
    comments: number;

    @Field(() => Int)
    @Column({ type: 'int', default: 0 })
    shares: number;

    @Field(() => Int, { nullable: true })
    @Column({ type: 'int', nullable: true })
    reach?: number;

    @Field(() => Int, { nullable: true })
    @Column({ type: 'int', nullable: true })
    saves?: number;

    @Field(() => Float, { nullable: true })
    @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
    engagementRate?: number;

    @Field(() => GraphQLJSON, { nullable: true })
    @Column({ type: 'jsonb', nullable: true })
    rawMetrics?: Record<string, any>;

    @Field()
    @Column({ type: 'timestamptz' })
    fetchedAt: Date;

    @Field()
    @CreateDateColumn()
    createdAt: Date;

    @Field(() => PublishedPost)
    @ManyToOne(() => PublishedPost, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'publishedPostId' })
    publishedPost: PublishedPost;
}
