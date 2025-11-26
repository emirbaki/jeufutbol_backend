import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { User } from './user.entity';
import { PublishedPost } from './published-post.entity';
import { Tenant } from './tenant.entity';
import {
  Field,
  GraphQLISODateTime,
  ID,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';

export enum PostStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  PUBLISHED = 'published',
  FAILED = 'failed',
}

registerEnumType(PostStatus, {
  name: 'PostStatus',
  description: 'PostStatus enum representing the status of a post',
});

@ObjectType() // 👈 GraphQL will now recognize this class
@Entity()
export class Post {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column({ type: 'uuid' })
  userId: string;

  @Field()
  @Column({ type: 'text' })
  content: string;

  @Field(() => [String], { nullable: true })
  @Column({ type: 'jsonb', nullable: true })
  mediaUrls: string[];

  @Field(() => String, { nullable: true })
  @Column({ type: 'jsonb', nullable: true })
  platformSpecificContent: Record<string, any>;

  @Field(() => PostStatus)
  @Column({ type: 'enum', enum: PostStatus, default: PostStatus.DRAFT })
  status: PostStatus;

  @Field(() => [String])
  @Column({ type: 'simple-array' })
  targetPlatforms: string[];

  @Field(() => GraphQLISODateTime, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  scheduledFor: Date | null;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;

  @Field(() => User)
  @ManyToOne(() => User, (user) => user.posts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Field(() => [PublishedPost], { nullable: true })
  @OneToMany(() => PublishedPost, (published) => published.post, {
    cascade: false,
  })
  publishedPosts: PublishedPost[];

  @Field(() => Tenant, { nullable: true })
  @ManyToOne(() => Tenant, { nullable: true })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column({ nullable: true })
  tenantId: string;
}
