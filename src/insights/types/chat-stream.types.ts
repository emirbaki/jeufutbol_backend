import { ObjectType, Field, registerEnumType } from '@nestjs/graphql';

export enum ChatStreamEventType {
    TOKEN = 'token',
    THINKING = 'thinking',
    UPDATE = 'update',
    DONE = 'done',
    ERROR = 'error',
}

registerEnumType(ChatStreamEventType, {
    name: 'ChatStreamEventType',
    description: 'Type of chat stream event',
});

@ObjectType()
export class ChatStreamEvent {
    @Field()
    sessionId: string;

    @Field(() => ChatStreamEventType)
    type: ChatStreamEventType;

    @Field({ nullable: true })
    content?: string;

    @Field({ nullable: true })
    node?: string;
}

@ObjectType()
export class ChatStreamStart {
    @Field()
    sessionId: string;

    @Field()
    status: string;
}
