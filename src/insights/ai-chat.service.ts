import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { PubSub } from 'graphql-subscriptions';
import { ChatStreamEventType } from './types/chat-stream.types';
import { ChatSession } from './entities/chat-session.entity';
import { ChatMessage } from './entities/chat-message.entity';
import { LLMService, LLMProvider, LLMTypes } from './llm.service';
import { AIInsightsService } from './ai-insights.service';
import { PostsService } from '../post/post.service';
import {
  MemorySaver,
  StateGraph,
  MessagesAnnotation,
} from '@langchain/langgraph';
import { SafeToolNode } from './utils/safe-tool-node';
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
} from '@langchain/core/messages';
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
import { SearchTool } from './tools/search.tool';
import { VisitPageTool } from './tools/visit-page.tool';

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
    @Inject('PUB_SUB') private readonly pubSub: PubSub,
  ) { }

  private cleanResponseContent(content: string): string {
    // Remove <think>...</think> blocks, including newlines
    return content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  }

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
    credentialId?: number,
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
    const model = await this.llmService.getModel(userId, tenantId, llmProvider, credentialId);
    const tools = [
      PostGeneratorTool.createTool(this.aiInsightsService, userId, tenantId),
      TrendAnalysisTool.createTool(this.aiInsightsService, userId, tenantId),
      ContentSuggestionTool.createTool(this.aiInsightsService, userId, tenantId),
      CreatePostTool.createTool(this.postsService, userId, tenantId),
      ListPostsTool.createTool(this.postsService, userId, tenantId),
      PublishPostTool.createTool(this.postsService, userId, tenantId),
      ...(await SqlTools.createTools(this.dataSource, model)),
      AssistantTool.createTool(),
      AssistantCommentaryTool.createTool(),
      SearchTool.createTool(),
      VisitPageTool.createTool(),
    ] as StructuredTool[];

    const memory = new MemorySaver();

    // Define the graph manually to use SafeToolNode
    const workflow = new StateGraph(MessagesAnnotation)
      .addNode('agent', async (state) => {
        const boundModel = (model as any).bindTools
          ? (model as any).bindTools(tools)
          : model;
        const response = await boundModel.invoke(state.messages);

        // Fallback: Check if model outputted a JSON tool call in the content
        if (
          (!response.tool_calls || response.tool_calls.length === 0) &&
          typeof response.content === 'string'
        ) {
          const content = response.content;
          // Regex to find { "function": "name", "arguments": { ... } }
          // We use a loose regex to capture the JSON block
          // First clean the content to ensure we don't match anything inside think blocks if possible,
          // though usually JSON is outside. But definitely we want the TEXT part to be clean.
          const cleanedContent = this.cleanResponseContent(content);

          const jsonMatch = content.match(
            /\{[\s\n]*"function":[\s\n]*"(.*?)",[\s\n]*"arguments":[\s\n]*(\{[\s\S]*?\})[\s\n]*\}/,
          );

          if (jsonMatch) {
            try {
              const toolName = jsonMatch[1];
              const toolArgs = JSON.parse(jsonMatch[2]);

              // Construct a tool call
              response.tool_calls = [
                {
                  name: toolName,
                  args: toolArgs,
                  id: `call_${Date.now()}`,
                  type: 'tool_call',
                },
              ];

              // Optional: Remove the JSON from the content so it doesn't look weird to the user
              // or keep it as "thought process". The user said "model prints out its thinking",
              // so maybe we clean it up or leave it.
              // Let's leave the text *before* the JSON as the "thought".
              const jsonIndex = content.indexOf(jsonMatch[0]);
              if (jsonIndex > 0) {
                response.content = content.substring(0, jsonIndex).trim();
              } else {
                response.content = '';
              }
            } catch (e) {
              // Failed to parse, ignore
              console.warn('Failed to parse fallback tool call', e);
            }
          }

          // Update the content to be the cleaned version for the final response if no tool was found
          // or if we just want to ensure clean output.
          // If we found a tool, we might have adjusted response.content already.
          // If we didn't find a tool, we definitely want clean content.
          if (!jsonMatch) {
            response.content = this.cleanResponseContent(content);
          }
        }

        return { messages: [response] };
      })
      .addNode('tools', new SafeToolNode(tools))
      .addEdge('__start__', 'agent')
      .addConditionalEdges('agent', (state) => {
        const lastMessage = state.messages[
          state.messages.length - 1
        ] as AIMessage;
        if (lastMessage.tool_calls?.length) {
          return 'tools';
        }
        return '__end__';
      })
      .addEdge('tools', 'agent');

    const agent = workflow.compile({ checkpointer: memory });

    const config = {
      configurable: { thread_id: `run-${Date.now()}` },
      recursionLimit: 50,
    };

    // 5. Invoke Agent
    try {
      const currentDate = new Date();
      const formattedDate = currentDate.toLocaleDateString('tr-TR', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      const systemMessage = new SystemMessage(`You are a helpful AI assistant with access to real-time web search capabilities.

## CURRENT DATE & TIME
Today is: ${formattedDate}
Current timestamp: ${currentDate.toISOString()}
IMPORTANT: Your training data has a knowledge cutoff. For ANY information about recent events (within the last year), you MUST use the web_search tool.

## WEB SEARCH & INFORMATION RETRIEVAL WORKFLOW
When users ask about current events, recent news, sports scores, stock prices, weather, or anything that requires up-to-date information:

1. **ALWAYS search first**: Use the "web_search" tool to find relevant results
   - Include the date or time period in your search query (e.g., "Fenerbahçe Başakşehir maç sonucu ${formattedDate}")
   - Be specific with your search terms
   
2. **ALWAYS visit pages for details**: After getting search results, use the "visit_page" tool to read the actual content
   - Search results only show snippets - they often lack the full details
   - Visit at least 1-2 relevant links to get comprehensive information
   - For sports: visit to get goal scorers, match minutes, lineups
   - For news: visit to get full story details
   
3. **Synthesize and respond**: After visiting pages, provide a complete answer based on the actual content

## EXAMPLE WORKFLOW
User: "Fenerbahçe dün nasıl oynadı?"

Your steps:
1. Search: web_search("Fenerbahçe maç sonucu ${formattedDate}")
2. Visit: visit_page("https://example-sports-site.com/match-report")
3. Read the content and extract: score, goal scorers with minutes, key events
4. Respond with a comprehensive summary

## CRITICAL RULES
- NEVER rely on your training data for recent events - it's outdated
- NEVER guess or make up information about current events
- If a user mentions "yesterday", "today", "this week", "recently" - YOU MUST SEARCH
- If search results are about the wrong date/event, search again with more specific terms
- If visit_page fails, try another URL from search results
- When users ask "who scored" or "what was the result" - these require visiting the actual page, not just search snippets

## DATABASE ACCESS
You have access to a SQL database with tables: post, tweets, insights, monitored_profiles.
ALWAYS filter your SQL queries by "tenantId" = '${tenantId}' to ensure data isolation.

## RESPONSE GUIDELINES
- Respond in the same language the user uses
- Be concise but comprehensive
- Cite your sources when providing news/facts
- IMPORTANT: Do not call any tool named "assistant". To reply to the user, just output the text directly.`);

      const result = await agent.invoke(
        {
          messages: [
            systemMessage,
            ...langChainHistory,
            new HumanMessage(message),
          ],
        },
        config,
      );

      const messages = result.messages;
      const lastMessage = messages[messages.length - 1];
      let responseContent = '';

      if (typeof lastMessage.content === 'string') {
        responseContent = this.cleanResponseContent(lastMessage.content);
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

  /**
   * Streaming chat with AI - publishes events via PubSub for WebSocket delivery
   */
  async streamChatWithAI(
    userId: string,
    tenantId: string,
    sessionId: string,
    message: string,
    llmProvider: LLMProvider = LLMTypes.OPENAI,
    credentialId?: number,
  ): Promise<void> {
    const pubSubTopic = `chat_stream_${sessionId}`;

    try {
      // Small delay to allow client to establish subscription before we start publishing events
      // This prevents race condition where events are published before subscription is ready
      await new Promise(resolve => setTimeout(resolve, 500));

      this.logger.log(`Starting stream for session ${sessionId}, topic: ${pubSubTopic}`);

      // Update session timestamp
      await this.chatSessionRepo.update(sessionId, { updatedAt: new Date() });

      // Save User Message
      await this.chatMessageRepo.save({
        sessionId,
        role: 'user',
        content: message,
      });

      // Prepare History
      const history = await this.chatMessageRepo.find({
        where: { sessionId },
        order: { createdAt: 'ASC' },
        take: 20,
      });

      const langChainHistory = history.map((msg) => {
        if (msg.role === 'user') {
          return new HumanMessage(msg.content);
        } else {
          return new AIMessage(msg.content);
        }
      });

      // Initialize Agent
      const model = await this.llmService.getModel(userId, tenantId, llmProvider, credentialId);
      const tools = [
        PostGeneratorTool.createTool(this.aiInsightsService, userId, tenantId),
        TrendAnalysisTool.createTool(this.aiInsightsService, userId, tenantId),
        ContentSuggestionTool.createTool(this.aiInsightsService, userId, tenantId),
        CreatePostTool.createTool(this.postsService, userId, tenantId),
        ListPostsTool.createTool(this.postsService, userId, tenantId),
        PublishPostTool.createTool(this.postsService, userId, tenantId),
        ...(await SqlTools.createTools(this.dataSource, model)),
        AssistantTool.createTool(),
        AssistantCommentaryTool.createTool(),
        SearchTool.createTool(),
        VisitPageTool.createTool(),
      ] as StructuredTool[];

      const memory = new MemorySaver();

      const workflow = new StateGraph(MessagesAnnotation)
        .addNode('agent', async (state) => {
          const boundModel = (model as any).bindTools
            ? (model as any).bindTools(tools)
            : model;
          const response = await boundModel.invoke(state.messages);

          // Handle JSON tool call fallback
          if (
            (!response.tool_calls || response.tool_calls.length === 0) &&
            typeof response.content === 'string'
          ) {
            const content = response.content;
            const jsonMatch = content.match(
              /\{[\s\n]*"function":[\s\n]*"(.*?)",[\s\n]*"arguments":[\s\n]*(\{[\s\S]*?\})[\s\n]*\}/,
            );

            if (jsonMatch) {
              try {
                const toolName = jsonMatch[1];
                const toolArgs = JSON.parse(jsonMatch[2]);
                response.tool_calls = [
                  {
                    name: toolName,
                    args: toolArgs,
                    id: `call_${Date.now()}`,
                    type: 'tool_call',
                  },
                ];
                const jsonIndex = content.indexOf(jsonMatch[0]);
                if (jsonIndex > 0) {
                  response.content = content.substring(0, jsonIndex).trim();
                } else {
                  response.content = '';
                }
              } catch (e) {
                console.warn('Failed to parse fallback tool call', e);
              }
            }

            if (!jsonMatch) {
              response.content = this.cleanResponseContent(content);
            }
          }

          return { messages: [response] };
        })
        .addNode('tools', new SafeToolNode(tools))
        .addEdge('__start__', 'agent')
        .addConditionalEdges('agent', (state) => {
          const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
          if (lastMessage.tool_calls?.length) {
            return 'tools';
          }
          return '__end__';
        })
        .addEdge('tools', 'agent');

      const agent = workflow.compile({ checkpointer: memory });

      const config = {
        configurable: { thread_id: `run-${Date.now()}` },
        recursionLimit: 50,
      };

      const currentDate = new Date();
      const formattedDate = currentDate.toLocaleDateString('tr-TR', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      const systemMessage = new SystemMessage(`You are a helpful AI assistant with access to real-time web search capabilities.

## CURRENT DATE & TIME
Today is: ${formattedDate}
Current timestamp: ${currentDate.toISOString()}
IMPORTANT: Your training data has a knowledge cutoff. For ANY information about recent events (within the last year), you MUST use the web_search tool.

## WEB SEARCH & INFORMATION RETRIEVAL WORKFLOW
When users ask about current events, recent news, sports scores, stock prices, weather, or anything that requires up-to-date information:

1. **ALWAYS search first**: Use the "web_search" tool to find relevant results
   - Include the date or time period in your search query
   - Be specific with your search terms
   
2. **ALWAYS visit pages for details**: After getting search results, use the "visit_page" tool to read the actual content
   - Search results only show snippets - they often lack the full details
   - Visit at least 1-2 relevant links to get comprehensive information

3. **Synthesize and respond**: After visiting pages, provide a complete answer based on the actual content

## DATABASE ACCESS
You have access to a SQL database with tables: post, tweets, insights, monitored_profiles.
ALWAYS filter your SQL queries by "tenantId" = '${tenantId}' to ensure data isolation.

## RESPONSE GUIDELINES
- Respond in the same language the user uses
- Be concise but comprehensive
- Cite your sources when providing news/facts
- IMPORTANT: Do not call any tool named "assistant". To reply to the user, just output the text directly.`);

      // Collect full response for saving
      let fullResponse = '';
      let thinkingContent = '';
      let isInsideThinkTag = false;

      // Stream the agent with updates and messages modes
      const streamResult = await agent.stream(
        {
          messages: [
            systemMessage,
            ...langChainHistory,
            new HumanMessage(message),
          ],
        },
        {
          ...config,
          streamMode: ['updates', 'messages'] as any,
        },
      );

      for await (const chunk of streamResult) {
        // Handle tuple format [mode, data] when using multiple stream modes
        const [mode, data] = Array.isArray(chunk) && chunk.length === 2
          ? chunk
          : ['updates', chunk];

        if (mode === 'updates') {
          // Node update - publish which step is being executed
          const nodeNames = Object.keys(data || {});
          if (nodeNames.length > 0) {
            const nodeName = nodeNames[0];
            this.logger.debug(`Publishing update event: node=${nodeName}`);
            await this.pubSub.publish(pubSubTopic, {
              chatStream: {
                sessionId,
                type: ChatStreamEventType.UPDATE,
                node: nodeName,
              },
            });
          }
        } else if (mode === 'messages') {
          // Message/token streaming
          const [messageChunk, metadata] = data as [any, any];

          // Check if this is a tool message (should be hidden from main output)
          const isToolMessage = messageChunk?._getType?.() === 'tool' ||
            messageChunk?.constructor?.name === 'ToolMessage' ||
            messageChunk?.type === 'tool' ||
            metadata?.langgraph_node === 'tools';

          if (messageChunk?.content) {
            let content = typeof messageChunk.content === 'string'
              ? messageChunk.content
              : '';

            // Route tool outputs to THINKING stream (hidden from main response)
            if (isToolMessage && content) {
              thinkingContent += content;
              await this.pubSub.publish(pubSubTopic, {
                chatStream: {
                  sessionId,
                  type: ChatStreamEventType.THINKING,
                  content,
                },
              });
              continue; // Skip to next chunk
            }

            // Check for thinking tags
            if (content.includes('<think>')) {
              isInsideThinkTag = true;
              content = content.replace('<think>', '');
            }

            if (content.includes('</think>')) {
              isInsideThinkTag = false;
              const parts = content.split('</think>');
              if (parts[0]) {
                thinkingContent += parts[0];
                await this.pubSub.publish(pubSubTopic, {
                  chatStream: {
                    sessionId,
                    type: ChatStreamEventType.THINKING,
                    content: parts[0],
                  },
                });
              }
              content = parts[1] || '';
            }

            if (isInsideThinkTag && content) {
              thinkingContent += content;
              await this.pubSub.publish(pubSubTopic, {
                chatStream: {
                  sessionId,
                  type: ChatStreamEventType.THINKING,
                  content,
                },
              });
            } else if (content) {
              fullResponse += content;
              await this.pubSub.publish(pubSubTopic, {
                chatStream: {
                  sessionId,
                  type: ChatStreamEventType.TOKEN,
                  content,
                },
              });
            }
          }
        }
      }

      // Clean and save the final response
      const cleanedResponse = this.cleanResponseContent(fullResponse);

      await this.chatMessageRepo.save({
        sessionId,
        role: 'assistant',
        content: cleanedResponse,
      });

      // Publish done event
      await this.pubSub.publish(pubSubTopic, {
        chatStream: {
          sessionId,
          type: ChatStreamEventType.DONE,
          content: cleanedResponse,
        },
      });

    } catch (error) {
      this.logger.error(`Stream chat failed: ${error.message}`);

      // Publish error event
      await this.pubSub.publish(pubSubTopic, {
        chatStream: {
          sessionId,
          type: ChatStreamEventType.ERROR,
          content: error.message || 'An error occurred',
        },
      });
    }
  }
}
