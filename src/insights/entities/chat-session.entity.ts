import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Field, ObjectType, ID } from '@nestjs/graphql';
import { User } from '../../entities/user.entity';
import { ChatMessage } from './chat-message.entity';
import { Workspace } from '../../entities/workspace.entity';

@ObjectType()
@Entity('chat_sessions')
export class ChatSession {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column()
  userId: string;

  @Field()
  @Column()
  tenantId: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  title: string;

  @Field(() => User)
  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Field(() => [ChatMessage], { nullable: 'itemsAndList' })
  @OneToMany(() => ChatMessage, (message) => message.session)
  messages: ChatMessage[];

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;

  @Field(() => String, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  workspaceId: string | null;

  @ManyToOne(() => Workspace, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'workspaceId' })
  workspace?: Workspace;
}
