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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { Insight } from 'src/entities/insight.entity';
import GraphQLJSON from 'graphql-type-json';
import { JobIdResponse, BatchIndexResponse } from './types/job-response.types';
import { CombinedAuthGuard } from '../auth/guards/combined-auth.guard';
import { ApiKeyScopeGuard } from '../auth/guards/api-key-scope.guard';
import { RequireScopes } from '../auth/decorators/require-scopes.decorator';
import { ApiKeyScope } from '../auth/api-key-scopes.enum';
import { CurrentApiKey } from '../auth/decorators/current-api-key.decorator';
import { ApiKey } from '../entities/api-key.entity';

@Resolver()
@UseGuards(CombinedAuthGuard, ApiKeyScopeGuard)
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
  @RequireScopes(ApiKeyScope.INSIGHTS_GENERATE)
  async generateAIInsights(
    @CurrentUser() user: User,
    @CurrentApiKey() apiKey: ApiKey,
    @Args('topic', { nullable: true }) topic?: string,
    @Args('llmProvider', { nullable: true }) llmProvider?: string,
    @Args('credentialId', { nullable: true, type: () => Int }) credentialId?: number,
  ): Promise<JobIdResponse> {
    const tenantId = user?.tenantId || apiKey?.tenantId;
    const userId = user?.id || apiKey?.createdByUserId;

    if (!userId) throw new Error('User context required');

    return this.aiInsightsService.generateInsights({
      userId: userId,
      tenantId: tenantId,
      topic,
      llmProvider: llmProvider as any,
      credentialId,
      useVectorSearch: !!topic,
    });
  }

  @Mutation(() => JobIdResponse, {
    description:
      'Generate post template (returns job ID - query jobStatus to check progress)',
  })
  @RequireScopes(ApiKeyScope.INSIGHTS_GENERATE)
  async generatePostTemplate(
    @CurrentUser() user: User,
    @CurrentApiKey() apiKey: ApiKey,
    @Args('insights', { type: () => [String] }) insights: string[],
    @Args('platform') platform: string,
    @Args('tone', { nullable: true }) tone?: string,
    @Args('llmProvider', { nullable: true }) llmProvider?: string,
    @Args('credentialId', { nullable: true, type: () => Int }) credentialId?: number,
  ): Promise<JobIdResponse> {
    const userId = user?.id || apiKey?.createdByUserId;
    if (!userId) throw new Error('User context required');

    return this.aiInsightsService.generatePostTemplate({
      insights,
      platform: platform as any,
      tone: tone as any,
      includeHashtags: true,
      includeEmojis: true,
      userId: userId,
      llmProvider: llmProvider as any,
      credentialId,
    });
  }

  @Query(() => GraphQLJSON)
  @RequireScopes(ApiKeyScope.INSIGHTS_READ)
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
  @RequireScopes(ApiKeyScope.INSIGHTS_GENERATE)
  async indexTweetsToVector(
    @CurrentUser() user: User,
    @CurrentApiKey() apiKey: ApiKey,
    @Args('profileId') profileId: string,
  ): Promise<JobIdResponse> {
    const tenantId = user?.tenantId || apiKey?.tenantId;
    const userId = user?.id || apiKey?.createdByUserId;
    if (!userId) throw new Error('User context required');

    // Verify user owns this profile before allowing indexing
    await this.monitoringService.getProfile(profileId, userId, tenantId);

    return this.aiInsightsService.queueIndexTweets(profileId);
  }

  @Mutation(() => BatchIndexResponse, {
    description:
      'Index tweets for ALL monitored profiles (returns array of job IDs)',
  })
  @RequireScopes(ApiKeyScope.INSIGHTS_GENERATE)
  async indexAllTweetsToVector(
    @CurrentUser() user: User,
    @CurrentApiKey() apiKey: ApiKey,
  ): Promise<BatchIndexResponse> {
    const tenantId = user?.tenantId || apiKey?.tenantId;
    // Queue indexing for all profiles in the user's tenant
    return this.aiInsightsService.queueIndexAllTweets(tenantId);
  }

  @CacheTTL(259200000) // 3 days
  @Query(() => [Insight])
  @RequireScopes(ApiKeyScope.INSIGHTS_READ)
  async getInsights(
    @CurrentUser() user: User,
    @CurrentApiKey() apiKey: ApiKey,
    @Args('limit', { nullable: true }) limit?: number,
  ) {
    const tenantId = user?.tenantId || apiKey?.tenantId;
    const userId = user?.id || apiKey?.createdByUserId;
    if (!userId) throw new Error('User context required');

    return this.aiInsightsService.getInsightsForUser(
      userId,
      tenantId,
      limit,
    );
  }

  @Mutation(() => Insight)
  @RequireScopes(ApiKeyScope.INSIGHTS_READ) // Read scope is enough to mark as read? Or maybe write? Let's use READ for now as it's minor state change
  async markInsightAsRead(
    @CurrentUser() user: User,
    @CurrentApiKey() apiKey: ApiKey,
    @Args('insightId') insightId: string,
  ) {
    const userId = user?.id || apiKey?.createdByUserId;
    if (!userId) throw new Error('User context required');

    const result = await this.aiInsightsService.markInsightAsRead(
      insightId,
      userId,
    );

    // Invalidate getInsights cache
    await this.cacheManager.del(`${userId}:getInsights:{}`);

    return result;
  }
}
