import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { UseGuards, UseInterceptors, Inject } from '@nestjs/common';
import {
  CacheInterceptor,
  CacheTTL,
  CACHE_MANAGER,
} from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { GraphqlCacheInterceptor } from '../cache/graphql-cache.interceptor';
import { AIInsightsService } from './ai-insights.service';
import { MonitoringService } from '../monitoring/monitoring.service';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { Insight } from 'src/entities/insight.entity';
import GraphQLJSON from 'graphql-type-json';
import { JobIdResponse, BatchIndexResponse } from './types/job-response.types';

@Resolver()
@UseGuards(GqlAuthGuard)
@UseInterceptors(GraphqlCacheInterceptor)
export class AIInsightsResolver {
  constructor(
    private aiInsightsService: AIInsightsService,
    private monitoringService: MonitoringService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) { }

  @Mutation(() => JobIdResponse, {
    description:
      'Generate AI insights (returns job ID - query jobStatus to check progress)',
  })
  async generateAIInsights(
    @CurrentUser() user: User,
    @Args('topic', { nullable: true }) topic?: string,
    @Args('llmProvider', { nullable: true }) llmProvider?: string,
  ): Promise<JobIdResponse> {
    return this.aiInsightsService.generateInsights({
      userId: user.id,
      tenantId: user.tenantId,
      topic,
      llmProvider: llmProvider as any,
      useVectorSearch: !!topic,
    });
  }

  @Mutation(() => JobIdResponse, {
    description:
      'Generate post template (returns job ID - query jobStatus to check progress)',
  })
  async generatePostTemplate(
    @CurrentUser() user: User,
    @Args('insights', { type: () => [String] }) insights: string[],
    @Args('platform') platform: string,
    @Args('tone', { nullable: true }) tone?: string,
    @Args('llmProvider', { nullable: true }) llmProvider?: string,
  ): Promise<JobIdResponse> {
    return this.aiInsightsService.generatePostTemplate({
      insights,
      platform: platform as any,
      tone: tone as any,
      includeHashtags: true,
      includeEmojis: true,
      userId: user.id,
      llmProvider: llmProvider as any,
    });
  }

  @Query(() => GraphQLJSON)
  async analyzeTrends(
    @Args('topic', { nullable: true }) topic?: string,
    @Args('timeRange', { nullable: true }) timeRange?: string,
  ) {
    return this.aiInsightsService.analyzeTrends({
      topic,
      timeRange: (timeRange as any) || '7d',
      minEngagement: 100,
    });
  }

  @Mutation(() => JobIdResponse, {
    description:
      'Index tweets to vector database (returns job ID - query jobStatus to check progress)',
  })
  async indexTweetsToVector(
    @CurrentUser() user: User,
    @Args('profileId') profileId: string,
  ): Promise<JobIdResponse> {
    // Verify user owns this profile before allowing indexing
    await this.monitoringService.getProfile(profileId, user.id, user.tenantId);

    return this.aiInsightsService.queueIndexTweets(profileId);
  }

  @Mutation(() => BatchIndexResponse, {
    description:
      'Index tweets for ALL monitored profiles (returns array of job IDs)',
  })
  async indexAllTweetsToVector(
    @CurrentUser() user: User,
  ): Promise<BatchIndexResponse> {
    // Queue indexing for all profiles in the user's tenant
    return this.aiInsightsService.queueIndexAllTweets(user.tenantId);
  }

  @CacheTTL(259200000) // 3 days
  @Query(() => [Insight])
  async getInsights(
    @CurrentUser() user: User,
    @Args('limit', { nullable: true }) limit?: number,
  ) {
    return this.aiInsightsService.getInsightsForUser(
      user.id,
      user.tenantId,
      limit,
    );
  }

  @Mutation(() => Insight)
  async markInsightAsRead(
    @CurrentUser() user: User,
    @Args('insightId') insightId: string,
  ) {
    const result = await this.aiInsightsService.markInsightAsRead(
      insightId,
      user.id,
    );

    // Invalidate getInsights cache
    // Note: Since getInsights has optional limit arg, we might need to invalidate multiple keys
    // or just accept that it will be eventually consistent.
    // For now, we try to invalidate the most common case (no args or default limit)
    // Ideally, we would use a pattern delete if supported, or just clear all user insights keys.
    // Since we can't easily pattern match without scanning, we'll just invalidate the base key for now.
    // A better approach would be to use tags if the cache store supports it.
    await this.cacheManager.del(`${user.id}:getInsights:{}`);

    return result;
  }
}
