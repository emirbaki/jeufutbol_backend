import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { CombinedAuthGuard } from '../auth/guards/combined-auth.guard';
import { ApiKeyScopeGuard } from '../auth/guards/api-key-scope.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { AnalyticsService } from './analytics.service';
import { RawAnalyticsDataType, AnalyticsSettingsType } from '../graphql/types/analytics.type';

@Resolver()
@UseGuards(CombinedAuthGuard, ApiKeyScopeGuard)
export class AnalyticsResolver {
    constructor(private analyticsService: AnalyticsService) { }

    @Query(() => RawAnalyticsDataType)
    async getAnalyticsData(
        @Args('period', { defaultValue: '7days' }) period: string,
        @CurrentUser() user: User,
    ): Promise<RawAnalyticsDataType> {
        const data = await this.analyticsService.getAnalyticsData(user.tenantId, period);

        return {
            analytics: data.analytics.map(a => ({
                id: a.id,
                publishedPostId: a.publishedPostId,
                platform: a.platform,
                views: a.views,
                likes: a.likes,
                comments: a.comments,
                shares: a.shares,
                reach: a.reach,
                saves: a.saves,
                engagementRate: a.engagementRate,
                rawMetrics: a.rawMetrics,
                fetchedAt: a.fetchedAt,
            })),
            publishedPosts: data.publishedPosts.map(p => ({
                id: p.id,
                postId: p.postId,
                platform: p.platform,
                platformPostId: p.platformPostId,
                platformPostUrl: p.platformPostUrl,
                publishedAt: p.publishedAt,
                content: p.post?.content?.substring(0, 200),
            })),
            settings: {
                id: data.settings.id,
                tenantId: data.settings.tenantId,
                refreshIntervalHours: data.settings.refreshIntervalHours,
                lastRefreshAt: data.settings.lastRefreshAt,
            },
        };
    }

    @Mutation(() => Boolean)
    async refreshAnalytics(@CurrentUser() user: User): Promise<boolean> {
        await this.analyticsService.refreshTenantAnalytics(user.tenantId);
        return true;
    }

    @Mutation(() => AnalyticsSettingsType)
    async updateAnalyticsRefreshInterval(
        @Args('hours') hours: number,
        @CurrentUser() user: User,
    ): Promise<AnalyticsSettingsType> {
        const settings = await this.analyticsService.updateRefreshInterval(user.tenantId, hours);
        return {
            id: settings.id,
            tenantId: settings.tenantId,
            refreshIntervalHours: settings.refreshIntervalHours,
            lastRefreshAt: settings.lastRefreshAt,
        };
    }
}
