import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { Field, ObjectType, ID } from '@nestjs/graphql';
import { ChatSession } from './chat-session.entity';
import GraphQLJSON from 'graphql-type-json';

@ObjectType()
@Entity('chat_messages')
export class ChatMessage {
    @Field(() => ID)
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Field()
    @Column()
    sessionId: string;

    @Field()
    @Column()
    role: 'user' | 'assistant';

    @Field()
    @Column('text')
    content: string;

    @Field(() => GraphQLJSON, { nullable: true })
    @Column('jsonb', { nullable: true })
    tokenUsage: any;

    @Field(() => ChatSession)
    @ManyToOne(() => ChatSession, (session) => session.messages, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'sessionId' })
    session: ChatSession;

    @Field()
    @CreateDateColumn()
    createdAt: Date;
}
