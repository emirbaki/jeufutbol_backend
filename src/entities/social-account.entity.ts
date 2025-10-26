import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ObjectType, Field, ID, registerEnumType } from '@nestjs/graphql';
import { User } from './user.entity';

export enum PlatformType {
  INSTAGRAM = 'instagram',
  FACEBOOK = 'facebook',
  X = 'x',
  TIKTOK = 'tiktok',
  YOUTUBE = 'youtube',
}

// 👇 Register enum for GraphQL
registerEnumType(PlatformType, {
  name: 'PlatformType',
  description: 'Supported social media platforms',
});

@ObjectType() // <-- GraphQL Object type
@Entity('social_accounts')
export class SocialAccount {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field(() => String)
  @Column({ type: 'uuid' })
  userId: string;

  @Field(() => PlatformType)
  @Column({ type: 'enum', enum: PlatformType })
  platform: PlatformType;

  @Field(() => String)
  @Column()
  platformUserId: string;

  @Field(() => String)
  @Column()
  platformUsername: string;

  @Field(() => String, { nullable: true })
  @Column({ nullable: true })
  profileImageUrl: string;

  // ⚠️ Do NOT expose tokens directly in GraphQL
  @Column({ type: 'text' })
  encryptedAccessToken: string;

  @Column({ type: 'text', nullable: true })
  encryptedRefreshToken: string;

  @Field(() => Date, { nullable: true })
  @Column({ nullable: true })
  tokenExpiresAt: Date;

  @Field(() => Boolean)
  @Column({ default: true })
  isActive: boolean;

  @Field(() => Date)
  @CreateDateColumn()
  createdAt: Date;

  @Field(() => Date)
  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, (user) => user.socialAccounts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
}
