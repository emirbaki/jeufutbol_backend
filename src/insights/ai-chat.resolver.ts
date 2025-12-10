import { Resolver, Query, Mutation, Args, Int, Subscription } from '@nestjs/graphql';
import { UseGuards, Inject } from '@nestjs/common';
import { PubSub } from 'graphql-subscriptions';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { AiChatService } from './ai-chat.service';
import { ChatSession } from './entities/chat-session.entity';
import { ChatMessage } from './entities/chat-message.entity';
import { ObjectType, Field } from '@nestjs/graphql';
import { ChatStreamEvent, ChatStreamStart } from './types/chat-stream.types';

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
  constructor(
    private aiChatService: AiChatService,
    @Inject('PUB_SUB') private readonly pubSub: PubSub,
  ) { }

  @Mutation(() => ChatSession)
  async createChatSession(
    @CurrentUser() user: User,
    @Args('title', { nullable: true }) title?: string,
  ) {
    return this.aiChatService.createChatSession(user.id, user.tenantId, title);
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
    @Args('credentialId', { nullable: true, type: () => Int }) credentialId?: number,
  ) {
    return this.aiChatService.chatWithAI(
      user.id,
      user.tenantId,
      sessionId || null,
      message,
      llmProvider as any,
      credentialId,
    );
  }

  /**
   * Start a streaming chat session - returns immediately with sessionId
   * Client should subscribe to chatStream with the returned sessionId
   */
  @Mutation(() => ChatStreamStart)
  async startChatStream(
    @CurrentUser() user: User,
    @Args('message') message: string,
    @Args('sessionId', { nullable: true }) sessionId?: string,
    @Args('llmProvider', { nullable: true }) llmProvider?: string,
    @Args('credentialId', { nullable: true, type: () => Int }) credentialId?: number,
  ): Promise<ChatStreamStart> {
    // Create session if not provided
    let currentSessionId = sessionId;
    if (!currentSessionId) {
      const newSession = await this.aiChatService.createChatSession(
        user.id,
        user.tenantId,
        message.substring(0, 30) + '...',
      );
      currentSessionId = newSession.id;
    }

    // Start streaming in the background (don't await)
    this.aiChatService.streamChatWithAI(
      user.id,
      user.tenantId,
      currentSessionId,
      message,
      (llmProvider as any) || 'openai',
      credentialId,
    ).catch((error) => {
      console.error('Stream chat error:', error);
    });

    return {
      sessionId: currentSessionId,
      status: 'started',
    };
  }

  /**
   * Subscribe to chat stream events for a specific session
   */
  @Subscription(() => ChatStreamEvent, {
    filter: (payload, variables) => {
      return payload.chatStream.sessionId === variables.sessionId;
    },
  })
  chatStream(@Args('sessionId') sessionId: string) {
    return this.pubSub.asyncIterableIterator(`chat_stream_${sessionId}`);
  }

  @Mutation(() => Boolean)
  async deleteChatSession(
    @CurrentUser() user: User,
    @Args('sessionId') sessionId: string,
  ) {
    return this.aiChatService.deleteChatSession(sessionId, user.id);
  }
}
