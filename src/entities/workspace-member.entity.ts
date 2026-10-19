import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ObjectType, Field, ID, registerEnumType } from '@nestjs/graphql';
import { Workspace } from './workspace.entity';
import { User } from './user.entity';

/** The role of a non-admin person inside one branch. ADMIN is a role of the whole organization. */
export enum WorkspaceRole {
  MANAGER = 'MANAGER',
  USER = 'USER',
}

registerEnumType(WorkspaceRole, { name: 'WorkspaceRole' });

/** A person's membership in one branch (workspace). */
@ObjectType()
@Entity('workspace_members')
@Index('UQ_workspace_members_pair', ['workspaceId', 'userId'], { unique: true })
export class WorkspaceMember {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  workspaceId: string;

  @Field(() => Workspace)
  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Workspace;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Field(() => WorkspaceRole)
  @Column({ type: 'enum', enum: WorkspaceRole, enumName: 'workspace_role_enum' })
  role: WorkspaceRole;

  @Field()
  @CreateDateColumn()
  createdAt: Date;
}
