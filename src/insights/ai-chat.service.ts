import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ChatSession } from './entities/chat-session.entity';
import { ChatMessage } from './entities/chat-message.entity';
import { LLMService, LLMProvider, LLMTypes } from './llm.service';
import { AIInsightsService } from './ai-insights.service';
import { PostsService } from '../post/post.service';
import { MemorySaver, StateGraph, MessagesAnnotation } from '@langchain/langgraph';
import { SafeToolNode } from './utils/safe-tool-node';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { StructuredTool } from '@langchain/core/tools';
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
import { SqlTools } from './tools/sql.tool';
import { AssistantTool, AssistantCommentaryTool } from './tools/assistant.tool';

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
        private dataSource: DataSource,
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
            ...(await SqlTools.createTools(this.dataSource, model)),
            AssistantTool.createTool(),
            AssistantCommentaryTool.createTool(),
        ] as StructuredTool[];

        const memory = new MemorySaver();

        // Define the graph manually to use SafeToolNode
        const workflow = new StateGraph(MessagesAnnotation)
            .addNode("agent", async (state) => {
                const boundModel = (model as any).bindTools ? (model as any).bindTools(tools) : model;
                const response = await boundModel.invoke(state.messages);
                return { messages: [response] };
            })
            .addNode("tools", new SafeToolNode(tools))
            .addEdge("__start__", "agent")
            .addConditionalEdges("agent", (state) => {
                const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
                if (lastMessage.tool_calls?.length) {
                    return "tools";
                }
                return "__end__";
            })
            .addEdge("tools", "agent");

        const agent = workflow.compile({ checkpointer: memory });

        const config = {
            configurable: { thread_id: `run-${Date.now()}` },
            recursionLimit: 50,
        };

        // 5. Invoke Agent
        try {
            const systemMessage = new SystemMessage(`You are a helpful AI assistant.
You have access to a SQL database with tables: post, tweets, insights, monitored_profiles.
ALWAYS filter your SQL queries by "tenantId" = '${tenantId}' to ensure data isolation.
Do not access data from other tenants.
If the user asks for "my posts" or "my insights", assume they mean data for tenant '${tenantId}'.
IMPORTANT: Do not call any tool named "assistant". To reply to the user, just output the text directly.`);

            const result = await agent.invoke(
                {
                    messages: [systemMessage, ...langChainHistory, new HumanMessage(message)],
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
