import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, In } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Tweet } from '../entities/tweet.entity';
import { MonitoredProfile } from '../entities/monitored-profile.entity';
import { Insight, InsightType } from '../entities/insight.entity';
import { VectorDbService } from './vector-db.service';
import { LLMService, LLMProvider, LLMTypes } from './llm.service';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { MemorySaver } from '@langchain/langgraph';
import { HumanMessage } from '@langchain/core/messages';
import {
  PostGeneratorTool,
  TrendAnalysisTool,
  ContentSuggestionTool,
} from './tools/post-generator.tool';

import { PostsService } from '../post/post.service';
import { QUEUE_NAMES, AI_INSIGHTS_JOBS } from '../queue/queue.config';
import {
  GenerateInsightsJobData,
  GeneratePostJobData,
  IndexTweetsJobData,
} from './dto/job.dto';

export interface GenerateInsightsDto {
  userId: string;
  tenantId: string;
  topic?: string;
  llmProvider?: LLMProvider;
  useVectorSearch?: boolean;
  credentialId?: number;
}

export interface PostTemplateDto {
  insights: string[];
  platform: 'twitter' | 'instagram' | 'facebook' | 'tiktok';
  tone?: 'professional' | 'casual' | 'humorous' | 'informative' | 'engaging';
  includeHashtags?: boolean;
  includeEmojis?: boolean;
  userId?: string;
  llmProvider?: LLMProvider;
  credentialId?: number;
}

@Injectable()
export class AIInsightsService {
  private readonly logger = new Logger(AIInsightsService.name);

  constructor(
    @InjectRepository(Tweet)
    private tweetRepository: Repository<Tweet>,
    @InjectRepository(MonitoredProfile)
    private monitoredProfileRepository: Repository<MonitoredProfile>,
    @InjectRepository(Insight)
    private insightRepository: Repository<Insight>,
    private vectorDbService: VectorDbService,
    private llmService: LLMService,
    private postsService: PostsService,
    @InjectQueue(QUEUE_NAMES.AI_INSIGHTS)
    private aiInsightsQueue: Queue,
  ) { }

  /**
   * Index tweets to vector database (Queue-based - returns job ID)
   */
  async queueIndexTweets(profileId: string): Promise<{ jobId: string }> {
    const jobData: IndexTweetsJobData = { profileId };

    const job = await this.aiInsightsQueue.add(
      AI_INSIGHTS_JOBS.INDEX_TWEETS,
      jobData,
      {
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    );

    this.logger.log(
      `Enqueued tweet indexing job ${job.id} for profile ${profileId}`,
    );

    return { jobId: job.id || '' };
  }

  /**
   * Queue tweet indexing for ALL profiles in a tenant
   */
  async queueIndexAllTweets(
    tenantId: string,
  ): Promise<{ jobIds: string[]; profileCount: number }> {
    // Get all active profiles for this tenant
    const profiles = await this.monitoredProfileRepository.find({
      where: { tenantId, isActive: true },
    });

    if (profiles.length === 0) {
      this.logger.warn(`No active profiles found for tenant ${tenantId}`);
      return { jobIds: [], profileCount: 0 };
    }

    const jobIds: string[] = [];

    // Queue a job for each profile
    for (const profile of profiles) {
      const jobData: IndexTweetsJobData = { profileId: profile.id };

      const job = await this.aiInsightsQueue.add(
        AI_INSIGHTS_JOBS.INDEX_TWEETS,
        jobData,
        {
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      );

      if (job.id) {
        jobIds.push(job.id);
      }
    }

    this.logger.log(
      `Enqueued ${jobIds.length} tweet indexing jobs for tenant ${tenantId} (${profiles.length} profiles)`,
    );

    return { jobIds, profileCount: profiles.length };
  }

  /**
   * Index tweets to vector database (Internal - called by processor or directly)
   */
  /**
   * Index tweets to vector database (Internal - called by processor or directly)
   */
  async indexTweetsToVectorDb(profileId: string): Promise<number> {
    try {
      // Only fetch tweets that haven't been indexed yet
      const tweets = await this.tweetRepository.find({
        where: {
          monitoredProfileId: profileId,
          isIndexedInVector: false, // Only unindexed tweets
        },
        order: { createdAt: 'DESC' },
        take: 100, // Reduced since we only fetch new tweets now
        relations: ['monitoredProfile'], // Ensure profile is loaded
      });

      if (tweets.length === 0) {
        this.logger.log('No new tweets to index');
        return 0;
      }

      this.logger.log(`Found ${tweets.length} unindexed tweets to process`);
      return await this.indexTweetsBatch(tweets);
    } catch (error) {
      this.logger.error(`Failed to index tweets: ${error.message}`);
      throw error;
    }
  }

  /**
   * Helper to index a batch of tweets
   */
  private async indexTweetsBatch(tweets: Tweet[]): Promise<number> {
    try {
      // Process in smaller batches to avoid overwhelming ChromaDB
      const BATCH_SIZE = 50;
      const DELAY_BETWEEN_BATCHES_MS = 1000; // 1 second
      let totalIndexed = 0;

      for (let i = 0; i < tweets.length; i += BATCH_SIZE) {
        const batch = tweets.slice(i, i + BATCH_SIZE);

        const documents = batch.map((tweet) => ({
          id: tweet.id,
          content: tweet.content,
          metadata: {
            tweetId: tweet.tweetId,
            username: tweet.monitoredProfile?.xUsername || 'unknown',
            timestamp: tweet.createdAt.toISOString(),
            likes: tweet.likes,
            retweets: tweet.retweets,
            hashtags: (tweet.hashtags || []).join(', '), // Convert array to string
            mentions: (tweet.mentions || []).join(', '), // Convert array to string
          },
        }));
        await this.vectorDbService.addDocuments(documents);

        // Mark tweets as indexed
        await this.tweetRepository.update(
          batch.map((t) => t.id),
          { isIndexedInVector: true },
        );

        totalIndexed += documents.length;

        this.logger.log(
          `Indexed batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(tweets.length / BATCH_SIZE)} (${documents.length} tweets)`,
        );

        // Add delay between batches (except for last batch)
        if (i + BATCH_SIZE < tweets.length) {
          await new Promise((resolve) =>
            setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS),
          );
        }
      }

      this.logger.log(
        `✓ Successfully indexed ${totalIndexed} tweets to vector DB`,
      );
      return totalIndexed;
    } catch (error) {
      this.logger.error(`Failed to batch index tweets: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate AI insights for a user (Queue-based - returns job ID)
   */
  async generateInsights(dto: GenerateInsightsDto): Promise<{ jobId: string }> {
    const jobData: GenerateInsightsJobData = dto;

    const job = await this.aiInsightsQueue.add(
      AI_INSIGHTS_JOBS.GENERATE_INSIGHTS,
      jobData,
      {
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    );

    this.logger.log(
      `Enqueued insight generation job ${job.id} for user ${dto.userId}`,
    );

    return { jobId: job.id || '' };
  }

  /**
   * Generate AI insights for a user (Internal - called by processor)
   */
  async generateInsightsInternal(dto: GenerateInsightsDto): Promise<Insight[]> {
    const { userId, topic, llmProvider, credentialId, useVectorSearch } = dto;

    try {
      this.logger.log(`Generating insights for user ${userId}`);

      // Get organization's monitored profiles (all profiles in the tenant)
      const profiles = await this.monitoredProfileRepository.find({
        where: { tenantId: dto.tenantId, isActive: true },
      });

      if (profiles.length === 0) {
        this.logger.warn('No monitored profiles found');
        return [];
      }

      // Get recent tweets
      let relevantTweets: Tweet[];

      if (useVectorSearch && topic) {
        // Use vector search for relevant tweets
        try {
          const searchResults = await this.vectorDbService.search(topic, 50);
          const tweetIds = searchResults.map((r) => r.id);

          if (tweetIds.length > 0) {
            relevantTweets = await this.tweetRepository.find({
              where: { id: In(tweetIds) },
            });
            this.logger.log(
              `Found ${relevantTweets.length} tweets via vector search for topic: "${topic}"`,
            );
          } else {
            this.logger.warn(
              `No vector search results for topic: "${topic}", falling back to recent tweets`,
            );
            relevantTweets = [];
          }
        } catch (error) {
          this.logger.error(
            `Vector search failed: ${error.message}, falling back to recent tweets`,
          );
          relevantTweets = [];
        }

        // Fallback to recent tweets if vector search found nothing
        if (relevantTweets.length === 0) {
          const weekAgo = new Date();
          weekAgo.setDate(weekAgo.getDate() - 7);
          const profileIds = profiles.map((p) => p.id);
          relevantTweets = await this.tweetRepository.find({
            where: {
              monitoredProfileId: In(profileIds),
              createdAt: MoreThan(weekAgo),
            },
            order: { createdAt: 'DESC' },
            take: 100,
          });
          this.logger.log(
            `Using ${relevantTweets.length} recent tweets as fallback`,
          );
        }
      } else {
        // Get recent tweets (last 7 days)
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);

        const profileIds = profiles.map((p) => p.id);
        relevantTweets = await this.tweetRepository.find({
          where: {
            monitoredProfileId: In(profileIds),
            createdAt: MoreThan(weekAgo),
          },
          order: { createdAt: 'DESC' },
          take: 100,
        });
      }

      if (relevantTweets.length === 0) {
        this.logger.warn('No relevant tweets found');
        return [];
      }

      // Generate insights using LLM
      const insights = await this.analyzeWithLLM(
        relevantTweets,
        userId,
        dto.tenantId,
        topic,
        llmProvider,
        credentialId
      );

      // Save insights to database
      const savedInsights = await this.insightRepository.save(insights);

      this.logger.log(`Generated ${savedInsights.length} insights`);
      return savedInsights;
    } catch (error) {
      this.logger.error(`Failed to generate insights: ${error.message}`);
      throw error;
    }
  }

  /**
   * Search for tweets using vector similarity
   */
  async searchTweets(query: string, limit = 10, offset = 0): Promise<Tweet[]> {
    try {
      this.logger.log(`Searching tweets for query: "${query}" (limit: ${limit}, offset: ${offset})`);

      const searchResults = await this.vectorDbService.search(query, limit, offset);
      const tweetIds = searchResults.map((r) => r.id);

      if (tweetIds.length === 0) {
        return [];
      }

      // Fetch full tweet entities
      // We use find with whereInIds equivalent
      const tweets = await this.tweetRepository.find({
        where: { id: In(tweetIds) },
        relations: ['monitoredProfile'],
        order: { createdAt: 'DESC' }, // Optional: sort by date, or we could try to preserve relevance order
      });

      // If we want to preserve the order from vector search (relevance), we need to sort manually
      // Create a map for O(1) lookup
      const tweetMap = new Map(tweets.map(t => [t.id, t]));

      // Map IDs back to tweets, filtering out any that might have been deleted from DB but exist in Vector DB
      return tweetIds
        .map(id => tweetMap.get(id))
        .filter(t => !!t);

    } catch (error) {
      this.logger.error(`Tweet search failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Analyze tweets using LLM
   */
  private async analyzeWithLLM(
    tweets: Tweet[],
    userId: string,
    tenantId: string,
    topic?: string,
    llmProvider?: LLMProvider,
    credentialId?: number,
  ): Promise<Insight[]> {
    const tweetsSummary = tweets.slice(0, 30).map((t, idx) => ({
      index: idx + 1,
      content: t.content,
      engagement: t.likes + t.retweets + t.replies,
      hashtags: t.hashtags,
      date: t.createdAt,
    }));

    const prompt = `Analyze these social media posts and generate actionable insights for content creation.

${topic ? `Focus on topic: ${topic}` : ''}

Posts data:
${JSON.stringify(tweetsSummary, null, 2)}

Generate exactly 5 different types of insights:
1. trending_topic: Identify what's currently trending
2. content_suggestion: Suggest specific content ideas
3. engagement_pattern: Analyze what drives engagement
4. optimal_posting_time: Suggest best times to post
5. audience_interest: Identify what the audience cares about

For each insight, provide:
- type: One of the insight types above
- title: A catchy, specific title
- description: Detailed actionable insight (100-200 words)
- metadata: Relevant data points (hashtags, metrics, examples)
- relevanceScore: Score from 0-1 indicating how relevant/actionable

Return ONLY a valid JSON array of insights, no additional text.

Content should be in Turkish.
`;

    try {
      const response = await this.llmService.generateCompletion(
        userId,
        prompt,
        llmProvider || LLMTypes.OPENAI,
        credentialId,
      );

      // Parse LLM response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('Failed to parse LLM response');
      }

      const parsedInsights = JSON.parse(jsonMatch[0]);

      // Convert to Insight entities
      return parsedInsights.map((data: any) => {
        const insight = new Insight();
        insight.userId = userId;
        insight.tenantId = tenantId; // Add tenantId!
        insight.type = data.type as InsightType;
        insight.title = data.title;
        insight.description = data.description;
        insight.metadata = data.metadata;
        insight.relevanceScore = data.relevanceScore || 0.5;
        insight.isRead = false;
        return insight;
      });
    } catch (error) {
      this.logger.error(`LLM analysis failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate post template (Queue-based - returns job ID)
   */
  async generatePostTemplate(dto: PostTemplateDto): Promise<{ jobId: string }> {
    const jobData: GeneratePostJobData = dto;

    const job = await this.aiInsightsQueue.add(
      AI_INSIGHTS_JOBS.GENERATE_POST,
      jobData,
      {
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    );

    this.logger.log(
      `Enqueued post generation job ${job.id} for platform ${dto.platform}`,
    );

    return { jobId: job.id || '' };
  }

  /**
   * Generate post template using LangChain agent with tools (Internal - called by processor)
   */
  async generatePostTemplateInternal(dto: PostTemplateDto): Promise<{
    content: string;
    hashtags: string[];
    platform: string;
    estimatedReach: string;
  }> {
    const {
      insights,
      platform,
      tone = 'engaging',
      includeHashtags = true,
      includeEmojis = true,
      userId = 'system',
      llmProvider = LLMTypes.OPENAI,
      credentialId,
    } = dto;

    try {
      // Get the LLM model
      const model = await this.llmService.getModel(userId, llmProvider, credentialId);

      // Create tools with all three tools including PostGeneratorTool
      const tools = [
        PostGeneratorTool.createTool(this),
        TrendAnalysisTool.createTool(this),
        ContentSuggestionTool.createTool(this),
      ];

      // Create the React agent with LangGraph
      const memory = new MemorySaver();
      const agent = createReactAgent({
        llm: model,
        tools,
        checkpointSaver: memory,
      });

      const prompt = `Generate a compelling social media post for ${platform} using these insights:

${insights.map((insight, idx) => `${idx + 1}. ${insight}`).join('\n')}

Requirements:
- Tone: ${tone}
- Platform: ${platform}
- Include hashtags: ${includeHashtags}
- Include emojis: ${includeEmojis}
- Character limit: ${this.getPlatformLimit(platform)}

You have access to tools to analyze trends and get content suggestions. Use them if helpful.

Make it engaging, authentic, and optimized for ${platform}'s audience.
Include suggested hashtags and estimate the potential reach.

Return as JSON with: content, hashtags (array), estimatedReach

`;

      // Invoke the agent
      const config = { configurable: { thread_id: `post-gen-${Date.now()}` } };
      const result = await agent.invoke(
        {
          messages: [new HumanMessage(prompt)],
        },
        config,
      );

      // Extract the final response
      const messages = result.messages;
      const lastMessage = messages[messages.length - 1];
      let responseText = lastMessage.content;

      if (typeof responseText !== 'string') {
        responseText = JSON.stringify(responseText);
      }

      // Parse result
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        // Fallback: generate directly if agent didn't return proper JSON
        this.logger.warn('Agent did not return JSON, generating directly');
        return await this.generatePostDirectly(dto);
      }

      const postTemplate = JSON.parse(jsonMatch[0]);

      return {
        content: postTemplate.content,
        hashtags: postTemplate.hashtags || [],
        platform,
        estimatedReach: postTemplate.estimatedReach || 'Medium',
      };
    } catch (error) {
      this.logger.error(`Failed to generate post template: ${error.message}`);
      // Fallback to direct generation
      return await this.generatePostDirectly(dto);
    }
  }

  /**
   * Fallback method to generate post directly without agent
   */
  private async generatePostDirectly(dto: PostTemplateDto): Promise<{
    content: string;
    hashtags: string[];
    platform: string;
    estimatedReach: string;
  }> {
    const {
      insights,
      platform,
      tone = 'engaging',
      includeHashtags = true,
      includeEmojis = true,
      userId = 'system',
      llmProvider = LLMTypes.OPENAI,
      credentialId,
    } = dto;

    const model = await this.llmService.getModel(userId, llmProvider, credentialId);

    const prompt = `Generate a compelling social media post for ${platform} using these insights:

${insights.map((insight, idx) => `${idx + 1}. ${insight}`).join('\n')}

Requirements:
- Tone: ${tone}
- Platform: ${platform}
- Include hashtags: ${includeHashtags}
- Include emojis: ${includeEmojis}
- Character limit: ${this.getPlatformLimit(platform)}

Return ONLY a JSON object with: content, hashtags (array), estimatedReach`;

    const response = await model.invoke(prompt);

    let responseText: string;
    if (typeof response === 'string') {
      responseText = response;
    } else if (
      response &&
      typeof response === 'object' &&
      'content' in response
    ) {
      responseText = String(response.content);
    } else {
      responseText = JSON.stringify(response);
    }

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse response');
    }

    const postTemplate = JSON.parse(jsonMatch[0]);

    return {
      content: postTemplate.content,
      hashtags: postTemplate.hashtags || [],
      platform,
      estimatedReach: postTemplate.estimatedReach || 'Medium',
    };
  }

  /**
   * Analyze current trends
   */
  async analyzeTrends(options: {
    topic?: string;
    timeRange: '24h' | '7d' | '30d';
    minEngagement: number;
  }): Promise<any> {
    const { topic, timeRange, minEngagement } = options;

    const hoursMap = { '24h': 24, '7d': 168, '30d': 720 };
    const since = new Date();
    since.setHours(since.getHours() - hoursMap[timeRange]);

    let query = this.tweetRepository
      .createQueryBuilder('tweet')
      .where('tweet.createdAt >= :since', { since })
      .andWhere(
        '(tweet.likes + tweet.retweets + tweet.replies) >= :minEngagement',
        { minEngagement },
      );

    if (topic) {
      query = query.andWhere('tweet.content ILIKE :topic', {
        topic: `%${topic}%`,
      });
    }

    const tweets = await query
      .orderBy('tweet.createdAt', 'DESC')
      .take(100)
      .getMany();

    // Analyze hashtags
    const hashtagCounts = new Map<string, number>();
    tweets.forEach((tweet) => {
      tweet.hashtags?.forEach((tag) => {
        hashtagCounts.set(tag, (hashtagCounts.get(tag) || 0) + 1);
      });
    });

    const topHashtags = Array.from(hashtagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));

    return {
      totalTweets: tweets.length,
      topHashtags,
      avgEngagement:
        tweets.length > 0
          ? tweets.reduce(
            (sum, t) => sum + t.likes + t.retweets + t.replies,
            0,
          ) / tweets.length
          : 0,
      timeRange,
    };
  }

  /**
   * Generate content suggestions
   */
  async generateContentSuggestions(options: {
    category?: string;
    count: number;
    userId?: string;
    llmProvider?: LLMProvider;
  }): Promise<string[]> {
    const {
      category,
      count,
      userId = 'system',
      llmProvider = LLMTypes.OPENAI,
    } = options;

    const prompt = `Generate ${count} creative content ideas${category ? ` for the ${category} category` : ''}.

Each idea should be:
- Unique and engaging
- Suitable for social media
- Based on current trends
- Actionable for content creators

Return as a JSON array of strings, no additional formatting.`;

    const response = await this.llmService.generateCompletion(
      prompt,
      userId,
      llmProvider,
    );
    const jsonMatch = response.match(/\[[\s\S]*\]/);

    if (!jsonMatch) {
      throw new Error('Failed to parse content suggestions');
    }

    return JSON.parse(jsonMatch[0]);
  }

  private getPlatformLimit(platform: string): number {
    const limits = {
      twitter: 280,
      instagram: 2200,
      facebook: 63206,
      linkedin: 3000,
    };
    return limits[platform] || 280;
  }

  /**
   * Get insights for a user's organization
   */
  async getInsightsForUser(
    userId: string,
    tenantId: string,
    limit = 20,
  ): Promise<Insight[]> {
    // Get ALL insights from the organization (not just the user's insights)
    return this.insightRepository.find({
      where: { tenantId },
      order: { relevanceScore: 'DESC', createdAt: 'DESC' },
      take: limit,
      relations: ['user'], // Include user relation to show who created each insight
    });
  }

  /**
   * Mark an insight as read
   */
  async markInsightAsRead(insightId: string, userId: string): Promise<Insight> {
    const insight = await this.insightRepository.findOne({
      where: { id: insightId, userId },
    });

    if (!insight) {
      throw new Error('Insight not found or unauthorized');
    }

    insight.isRead = true;
    return this.insightRepository.save(insight);
  }

  /**
   * Re-index all tweets in the database
   * Useful when changing embedding models
   */
  async reindexAllTweets(): Promise<{ success: boolean; count: number }> {
    try {
      this.logger.log('Starting full re-indexing of tweets...');

      // 1. Reset the vector database collection
      await this.vectorDbService.resetCollection();

      // 2. Fetch all tweets with profiles
      const tweets = await this.tweetRepository.find({
        relations: ['monitoredProfile'],
      });

      this.logger.log(`Found ${tweets.length} tweets to re-index.`);

      if (tweets.length === 0) {
        return { success: true, count: 0 };
      }

      // 3. Process in chunks to avoid memory issues
      const chunkSize = 50;
      for (let i = 0; i < tweets.length; i += chunkSize) {
        const chunk = tweets.slice(i, i + chunkSize);
        await this.indexTweetsBatch(chunk);
        this.logger.log(`Indexed chunk ${i / chunkSize + 1}/${Math.ceil(tweets.length / chunkSize)}`);
      }

      this.logger.log('Full re-indexing completed successfully.');
      return { success: true, count: tweets.length };
    } catch (error) {
      this.logger.error(`Re-indexing failed: ${error.message}`);
      throw error;
    }
  }
}
