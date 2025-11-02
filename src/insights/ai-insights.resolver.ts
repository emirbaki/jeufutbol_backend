import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { AIInsightsService } from './ai-insights.service';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { Insight } from 'src/entities/insight.entity';
import GraphQLJSON from 'graphql-type-json';

@Resolver()
@UseGuards(GqlAuthGuard)
export class AIInsightsResolver {
  constructor(private aiInsightsService: AIInsightsService) {}

  @Mutation(() => [Insight])
  async generateAIInsights(
    @CurrentUser() user: User,
    @Args('topic', { nullable: true }) topic?: string,
    @Args('llmProvider', { nullable: true }) llmProvider?: string,
  ) {
    return this.aiInsightsService.generateInsights({
      userId: user.id,
      topic,
      llmProvider: llmProvider as any,
      useVectorSearch: !!topic,
    });
  }

  @Mutation(() => GraphQLJSON)
  async generatePostTemplate(
    @Args('insights', { type: () => [String] }) insights: string[],
    @Args('platform') platform: string,
    @Args('tone', { nullable: true }) tone?: string,
  ) {
    return this.aiInsightsService.generatePostTemplate({
      insights,
      platform: platform as any,
      tone: tone as any,
      includeHashtags: true,
      includeEmojis: true,
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

  @Mutation(() => Int)
  async indexTweetsToVector(
    @CurrentUser() user: User,
    @Args('profileId') profileId: string,
  ) {
    return this.aiInsightsService.indexTweetsToVectorDb(profileId);
  }
}
