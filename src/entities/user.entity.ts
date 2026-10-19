import { ObjectType, Field, ID } from '@nestjs/graphql';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Post } from './post.entity';
import { MonitoredProfile } from './monitored-profile.entity';
import { Tenant } from './tenant.entity';
import { Workspace } from './workspace.entity';
import { ManyToOne, JoinColumn } from 'typeorm';
import { UserRole } from '../auth/user-role.enum';

@ObjectType() // 👈 This makes it a valid GraphQL type
@Entity('users')
export class User {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column({ unique: true })
  email: string;

  @Column()
  passwordHash: string;

  @Field()
  @Column({ default: false })
  isVerified: boolean;

  @Column({ type: 'text', nullable: true })
  verificationToken: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  verificationTokenExpiry: Date | null;

  @Column({ type: 'text', nullable: true })
  resetToken: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  resetTokenExpiry: Date | null;

  @Field()
  @Column()
  firstName: string;

  @Field()
  @Column()
  lastName: string;

  @Field()
  @Column({ default: true })
  isActive: boolean;

  @Field(() => Date)
  @CreateDateColumn()
  createdAt: Date;

  @Field(() => Date)
  @UpdateDateColumn()
  updatedAt: Date;

  @Field(() => [Post], { nullable: true })
  @OneToMany(() => Post, (post) => post.user)
  posts: Post[];

  @Field(() => [MonitoredProfile], { nullable: true })
  @Field(() => [MonitoredProfile], { nullable: true })
  @OneToMany(() => MonitoredProfile, (profile) => profile.user)
  monitoredProfiles: MonitoredProfile[];

  @Field(() => Tenant, { nullable: true })
  @ManyToOne(() => Tenant, (tenant) => tenant.users, { nullable: true })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column({ nullable: true })
  tenantId: string;

  /** The workspace that opens after login. */
  @Column({ type: 'uuid', nullable: true })
  activeWorkspaceId: string | null;

  @Field(() => Workspace, { nullable: true })
  @ManyToOne(() => Workspace, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'activeWorkspaceId' })
  activeWorkspace?: Workspace | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  avatarUrl: string | null;

  @Field(() => UserRole)
  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.USER,
  })
  role: UserRole;

  // Notification Settings
  @Field()
  @Column({ default: true })
  notifyOnPublish: boolean;

  @Field()
  @Column({ default: true })
  notifyOnFail: boolean;

  @Field()
  @Column({ default: true })
  notifyWeeklyReport: boolean;

  @Field()
  @Column({ default: true })
  notifyNewInsights: boolean;
}
