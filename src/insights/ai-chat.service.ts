import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatSession } from './entities/chat-session.entity';
import { ChatMessage } from './entities/chat-message.entity';
import { LLMService, LLMProvider, LLMTypes } from './llm.service';
import { AIInsightsService } from './ai-insights.service';
import { PostsService } from '../post/post.service';
import { createAgent } from 'langchain';
import { MemorySaver } from '@langchain/langgraph';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import {
    PostGeneratorTool,
    TrendAnalysisTool,
    ContentSuggestionTool,
} from './tools/post-generator.tool';
import {
    CreatePostTool,
    ListPostsTool,
    PublishPostTool,
} from './tools/post-management.tool';

@Injectable()
export class AiChatService {
    private readonly logger = new Logger(AiChatService.name);

    constructor(
        @InjectRepository(ChatSession)
        private chatSessionRepo: Repository<ChatSession>,
        @InjectRepository(ChatMessage)
        private chatMessageRepo: Repository<ChatMessage>,
        private llmService: LLMService,
        private aiInsightsService: AIInsightsService,
        private postsService: PostsService,
    ) { }

    async createChatSession(
        userId: string,
        tenantId: string,
        title?: string,
    ): Promise<ChatSession> {
        const session = this.chatSessionRepo.create({
            userId,
            tenantId,
            title: title || 'New Chat',
        });
        return this.chatSessionRepo.save(session);
    }

    async getUserChatSessions(
        userId: string,
        tenantId: string,
    ): Promise<ChatSession[]> {
        return this.chatSessionRepo.find({
            where: { userId, tenantId },
            order: { updatedAt: 'DESC' },
        });
    }

    async getChatSessionHistory(
        sessionId: string,
        userId: string,
    ): Promise<ChatMessage[]> {
        // Verify ownership
        const session = await this.chatSessionRepo.findOne({
            where: { id: sessionId, userId },
        });
        if (!session) {
            throw new Error('Session not found or unauthorized');
        }

        return this.chatMessageRepo.find({
            where: { sessionId },
            order: { createdAt: 'ASC' },
        });
    }

    async chatWithAI(
        userId: string,
        tenantId: string,
        sessionId: string | null,
        message: string,
        llmProvider: LLMProvider = LLMTypes.OPENAI,
    ): Promise<{ response: string; sessionId: string }> {
        let currentSessionId = sessionId;

        // 1. Create session if not exists
        if (!currentSessionId) {
            const newSession = await this.createChatSession(
                userId,
                tenantId,
                message.substring(0, 30) + '...',
            );
            currentSessionId = newSession.id;
        } else {
            // Verify ownership
            const session = await this.chatSessionRepo.findOne({
                where: { id: currentSessionId, userId },
            });
            if (!session) {
                throw new Error('Session not found or unauthorized');
            }
            // Update timestamp
            await this.chatSessionRepo.update(currentSessionId, {
                updatedAt: new Date(),
            });
        }

        // 2. Save User Message
        await this.chatMessageRepo.save({
            sessionId: currentSessionId,
            role: 'user',
            content: message,
        });

        // 3. Prepare History (Context Window)
        // Fetch last 20 messages for context
        const history = await this.chatMessageRepo.find({
            where: { sessionId: currentSessionId },
            order: { createdAt: 'ASC' }, // LangChain expects chronological order
            take: 20,
        });

        const langChainHistory = history.map((msg) => {
            if (msg.role === 'user') {
                return new HumanMessage(msg.content);
            } else {
                return new AIMessage(msg.content);
            }
        });

        // 4. Initialize Agent
        const model = await this.llmService.getModel(userId, llmProvider);
        const tools = [
            PostGeneratorTool.createTool(this.aiInsightsService),
            TrendAnalysisTool.createTool(this.aiInsightsService),
            ContentSuggestionTool.createTool(this.aiInsightsService),
            CreatePostTool.createTool(this.postsService, userId, tenantId),
            ListPostsTool.createTool(this.postsService, userId, tenantId),
            PublishPostTool.createTool(this.postsService, userId, tenantId),
        ];

        const memory = new MemorySaver(); // We use ephemeral memory for the agent run, but feed persistent history
        const agent = createAgent({
            model,
            tools,
            checkpointer: memory,
        });

        const config = {
            configurable: { thread_id: `run-${Date.now()}` },
        };

        // 5. Invoke Agent
        try {
            const result = await agent.invoke(
                {
                    messages: [...langChainHistory, new HumanMessage(message)],
                },
                config,
            );

            const messages = result.messages;
            const lastMessage = messages[messages.length - 1];
            let responseContent = '';

            if (typeof lastMessage.content === 'string') {
                responseContent = lastMessage.content;
            } else {
                responseContent = JSON.stringify(lastMessage.content);
            }

            // Extract Token Usage (if available)
            const responseMetadata = lastMessage.response_metadata as any;
            const tokenUsage = responseMetadata?.tokenUsage || {};

            // 6. Save Assistant Message
            await this.chatMessageRepo.save({
                sessionId: currentSessionId,
                role: 'assistant',
                content: responseContent,
                tokenUsage,
            });

            return {
                response: responseContent,
                sessionId: currentSessionId,
            };
        } catch (error) {
            this.logger.error(`Chat failed: ${error.message}`);
            throw error;
        }
    }

    async deleteChatSession(sessionId: string, userId: string): Promise<boolean> {
        const result = await this.chatSessionRepo.delete({ id: sessionId, userId });
        return (result.affected ?? 0) > 0;
    }
}
