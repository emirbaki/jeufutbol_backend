import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { AiChatService } from './ai-chat.service';
import { ChatSession } from './entities/chat-session.entity';
import { ChatMessage } from './entities/chat-message.entity';
import { ObjectType, Field } from '@nestjs/graphql';

@ObjectType()
class ChatResponse {
    @Field()
    response: string;

    @Field()
    sessionId: string;
}

@Resolver()
@UseGuards(GqlAuthGuard)
export class AiChatResolver {
    constructor(private aiChatService: AiChatService) { }

    @Mutation(() => ChatSession)
    async createChatSession(
        @CurrentUser() user: User,
        @Args('title', { nullable: true }) title?: string,
    ) {
        return this.aiChatService.createChatSession(
            user.id,
            user.tenantId,
            title,
        );
    }

    @Query(() => [ChatSession])
    async getUserChatSessions(@CurrentUser() user: User) {
        return this.aiChatService.getUserChatSessions(user.id, user.tenantId);
    }

    @Query(() => [ChatMessage])
    async getChatSessionHistory(
        @CurrentUser() user: User,
        @Args('sessionId') sessionId: string,
    ) {
        return this.aiChatService.getChatSessionHistory(sessionId, user.id);
    }

    @Mutation(() => ChatResponse)
    async chatWithAI(
        @CurrentUser() user: User,
        @Args('message') message: string,
        @Args('sessionId', { nullable: true }) sessionId?: string,
        @Args('llmProvider', { nullable: true }) llmProvider?: string,
    ) {
        return this.aiChatService.chatWithAI(
            user.id,
            user.tenantId,
            sessionId || null,
            message,
            llmProvider as any,
        );
    }

    @Mutation(() => Boolean)
    async deleteChatSession(
        @CurrentUser() user: User,
        @Args('sessionId') sessionId: string,
    ) {
        return this.aiChatService.deleteChatSession(sessionId, user.id);
    }
}
