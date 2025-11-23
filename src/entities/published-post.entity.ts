import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ObjectType, Field, ID } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-type-json';
import { Post } from './post.entity';
import { PlatformType } from '../enums/platform-type.enum';
import { registerEnumType } from '@nestjs/graphql';

// Register the PlatformType enum for GraphQL
registerEnumType(PlatformType, {
  name: 'PlatformType',
  description: 'Supported social media platforms for published posts',
});

@ObjectType()
@Entity('published_posts')
export class PublishedPost {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field(() => String)
  @Column({ type: 'uuid' })
  postId: string;

  @Field(() => PlatformType)
  @Column({ type: 'enum', enum: PlatformType })
  platform: PlatformType;

  @Field()
  @Column()
  platformPostId: string;

  @Field()
  @Column()
  platformPostUrl: string;

  @Field(() => GraphQLJSON, { nullable: true })
  @Column({ type: 'jsonb', nullable: true })
  publishMetadata?: Record<string, any>;

  @Field()
  @CreateDateColumn()
  publishedAt: Date;

  @Field(() => Post)
  @ManyToOne(() => Post, (post) => post.publishedPosts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'postId' })
  post: Post;
}
