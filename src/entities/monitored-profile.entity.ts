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
import { ObjectType, Field, ID } from '@nestjs/graphql';
import { User } from './user.entity';
import { Tweet } from './tweet.entity';

@ObjectType() // <-- Expose this entity as a GraphQL type
@Entity('monitored_profiles')
export class MonitoredProfile {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field(() => String)
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
  displayName?: string;

  @Field()
  @Column()
  followerCount: number;

  @Field()
  @Column()
  description: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  profileImageUrl?: string;

  @Field()
  @Column({ default: true })
  isActive: boolean;

  @Field({ nullable: true })
  @Column({ nullable: true })
  lastFetchedAt?: Date;

  @Field(() => String, {
    nullable: true,
    description: 'JSON metadata as stringified object',
  })
  @Column({ type: 'jsonb', nullable: true })
  fetchMetadata?: Record<string, any>;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;

  // --- RELATIONS ---

  @Field(() => User)
  @ManyToOne(() => User, (user) => user.monitoredProfiles, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Field(() => [Tweet])
  @OneToMany(() => Tweet, (tweet) => tweet.monitoredProfile)
  tweets: Tweet[];
}
