import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../entities/user.entity';
import { Field, ID, ObjectType } from '@nestjs/graphql';

export enum CredentialType {
  OAUTH2 = 'oauth2',
  API_KEY = 'api_key',
  BEARER_TOKEN = 'bearer_token',
}

export enum PlatformName {
  X = 'x',
  INSTAGRAM = 'instagram',
  FACEBOOK = 'facebook',
  TIKTOK = 'tiktok',
  YOUTUBE = 'youtube',
}

@ObjectType()
@Entity('credentials')
export class Credential {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column()
  name: string;

  @Field(() => String)
  @Column({ type: 'enum', enum: PlatformName })
  platform: PlatformName;

  @Field(() => String)
  @Column({ type: 'enum', enum: CredentialType })
  type: CredentialType;

  @Field(() => String)
  @Column({ type: 'uuid' })
  userId: string;

  @Field()
  @Column({ type: 'text' })
  encryptedData: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  refreshToken: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  accessToken: string | null;

  @Field(() => String, { nullable: true })
  @Column({ nullable: true })
  accessSecret?: string | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  tokenExpiresAt: Date | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  accountId: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  accountName: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  accountImage: string | null;

  @Field()
  @Column({ default: true })
  isActive: boolean;

  @Field(() => String, { nullable: true })
  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
}
