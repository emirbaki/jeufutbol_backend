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
import { Tenant } from './tenant.entity';
import { TweetMonitoredProfile } from './tweet-monitored-profile.entity';
import { ObjectType, Field, ID, Int } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';

@ObjectType()
@Entity('monitored_profiles')
export class MonitoredProfile {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column({ type: 'uuid' })
  userId: string;

  @Field()
  @Column()
  xUsername: string;

  @Field()
  @Column()
  xUserId: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  displayName: string;

  @Field(() => Int, { nullable: true })
  @Column({ type: 'int', nullable: true, default: 0 })
  followerCount: number;

  @Field({ nullable: true })
  @Column({ type: 'text', nullable: true })
  description: string;

  @Field({ nullable: true })
  @Column({ type: 'text', nullable: true })
  profileImageUrl: string;

  @Field()
  @Column({ default: true })
  isActive: boolean;

  @Field({ nullable: true })
  @Column({ nullable: true })
  lastFetchedAt: Date;

  @Field(() => GraphQLJSON, { nullable: true })
  @Column({ type: 'jsonb', nullable: true })
  fetchMetadata: Record<string, any>;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;

  @Field(() => User, { nullable: true })
  @ManyToOne(() => User, (user) => user.monitoredProfiles, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'userId' })
  user: User;

  /**
   * Many-to-many relationship with Tweets via junction table.
   * A monitored profile can have many tweets linked to it.
   */
  @OneToMany(
    () => TweetMonitoredProfile,
    (tmp) => tmp.monitoredProfile,
  )
  tweetMonitoredProfiles?: TweetMonitoredProfile[];

  @Field(() => Tenant, { nullable: true })
  @ManyToOne(() => Tenant, { nullable: true })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column({ nullable: true })
  tenantId: string;
}
