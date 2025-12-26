import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, MoreThanOrEqual } from 'typeorm';
import { PostAnalytics } from '../entities/post-analytics.entity';
import { AnalyticsSettings } from '../entities/analytics-settings.entity';
import { PublishedPost } from '../entities/published-post.entity';
import { PlatformType } from '../enums/platform-type.enum';
import { CredentialsService } from '../credentials/credential.service';
import { PlatformName } from '../entities/credential.entity';
import { PostGatewayFactory } from './post-gateway.factory';

/**
 * Raw analytics data returned to frontend for processing
 */
export interface RawAnalyticsData {
    analytics: PostAnalytics[];
    publishedPosts: PublishedPost[];
    settings: AnalyticsSettings;
}

@Injectable()
export class AnalyticsService {
    private readonly logger = new Logger(AnalyticsService.name);

    constructor(
        @InjectRepository(PostAnalytics)
        private postAnalyticsRepo: Repository<PostAnalytics>,
        @InjectRepository(AnalyticsSettings)
        private settingsRepo: Repository<AnalyticsSettings>,
        @InjectRepository(PublishedPost)
        private publishedPostRepo: Repository<PublishedPost>,
        private readonly credentialsService: CredentialsService,
        private readonly postGatewayFactory: PostGatewayFactory,
    ) { }

    async getOrCreateSettings(tenantId: string): Promise<AnalyticsSettings> {
        let settings = await this.settingsRepo.findOne({ where: { tenantId } });
        if (!settings) {
            settings = this.settingsRepo.create({
                tenantId,
                refreshIntervalHours: 6,
            });
            await this.settingsRepo.save(settings);
        }
        return settings;
    }

    async updateRefreshInterval(tenantId: string, hours: number): Promise<AnalyticsSettings> {
        const settings = await this.getOrCreateSettings(tenantId);
        settings.refreshIntervalHours = hours;
        return this.settingsRepo.save(settings);
    }

    async getAnalyticsData(tenantId: string, period: string): Promise<RawAnalyticsData> {
        const settings = await this.getOrCreateSettings(tenantId);
        const startDate = this.calculateStartDate(period);

        const publishedPosts = await this.publishedPostRepo.find({
            where: {
                tenantId,
                publishedAt: MoreThanOrEqual(startDate),
            },
            relations: ['post'],
            order: { publishedAt: 'DESC' },
        });

        const postIds = publishedPosts.map(p => p.id);
        const analytics = postIds.length > 0
            ? await this.postAnalyticsRepo.find({
                where: { publishedPostId: In(postIds) },
                order: { fetchedAt: 'DESC' },
            })
            : [];

        return { analytics, publishedPosts, settings };
    }

    async refreshTenantAnalytics(tenantId: string): Promise<void> {
        this.logger.log(`[Analytics] Refreshing analytics for tenant: ${tenantId}`);

        const publishedPosts = await this.publishedPostRepo.find({
            where: { tenantId },
        });

        for (const publishedPost of publishedPosts) {
            try {
                await this.refreshPostAnalytics(publishedPost, tenantId);
                await this.delay(500);
            } catch (error: any) {
                this.logger.error(
                    `[Analytics] Failed to refresh ${publishedPost.platform} post ${publishedPost.id}: ${error.message}`,
                );
            }
        }

        const settings = await this.getOrCreateSettings(tenantId);
        settings.lastRefreshAt = new Date();
        await this.settingsRepo.save(settings);

        this.logger.log(`[Analytics] Completed refresh for tenant: ${tenantId}`);
    }

    private async refreshPostAnalytics(
        publishedPost: PublishedPost,
        tenantId: string,
    ): Promise<PostAnalytics | null> {
        // Get gateway for this platform
        const gateway = this.postGatewayFactory.getGateway(publishedPost.platform);
        if (!gateway.getPostAnalytics) {
            this.logger.warn(`[Analytics] No analytics support for ${publishedPost.platform}`);
            return null;
        }

        // Get access token (X doesn't need one - uses rettiwt)
        let accessToken: string | undefined;
        if (publishedPost.platform !== PlatformType.X) {
            const platformName = this.platformTypeToPlatformName(publishedPost.platform);
            if (!platformName) return null;

            const credentials = await this.credentialsService.getTenantCredentials(
                tenantId,
                platformName,
            );
            if (credentials.length === 0) {
                this.logger.warn(`[Analytics] No credential for ${publishedPost.platform}`);
                return null;
            }

            const token = await this.credentialsService.getDecryptedAccessToken(credentials[0].id);
            if (!token) {
                this.logger.warn(`[Analytics] No access token for ${publishedPost.platform}`);
                return null;
            }
            accessToken = token;
        }

        // Fetch analytics from platform
        let analyticsData;
        try {
            analyticsData = await gateway.getPostAnalytics(
                publishedPost.platformPostId,
                accessToken,
            );
        } catch (error: any) {
            this.logger.error(`[Analytics] Gateway error: ${error.message}`);
            return null;
        }

        // Calculate engagement rate
        const totalEngagements = analyticsData.likes + analyticsData.comments + analyticsData.shares;
        const engagementRate = analyticsData.views > 0
            ? (totalEngagements / analyticsData.views) * 100
            : 0;

        // Check for existing analytics record for this post
        let analytics = await this.postAnalyticsRepo.findOne({
            where: { publishedPostId: publishedPost.id },
        });

        if (analytics) {
            // Update existing record
            analytics.views = analyticsData.views;
            analytics.likes = analyticsData.likes;
            analytics.comments = analyticsData.comments;
            analytics.shares = analyticsData.shares;
            analytics.reach = analyticsData.reach;
            analytics.saves = analyticsData.saves;
            analytics.engagementRate = Math.round(engagementRate * 100) / 100;
            analytics.rawMetrics = analyticsData.rawMetrics;
            analytics.fetchedAt = new Date();
        } else {
            // Create new record
            analytics = this.postAnalyticsRepo.create({
                publishedPostId: publishedPost.id,
                platform: publishedPost.platform,
                views: analyticsData.views,
                likes: analyticsData.likes,
                comments: analyticsData.comments,
                shares: analyticsData.shares,
                reach: analyticsData.reach,
                saves: analyticsData.saves,
                engagementRate: Math.round(engagementRate * 100) / 100,
                rawMetrics: analyticsData.rawMetrics,
                fetchedAt: new Date(),
            });
        }

        return this.postAnalyticsRepo.save(analytics);
    }

    private calculateStartDate(period: string): Date {
        const now = new Date();
        const startDate = new Date();
        switch (period) {
            case '7days':
                startDate.setDate(now.getDate() - 7);
                break;
            case '30days':
                startDate.setDate(now.getDate() - 30);
                break;
            case '90days':
                startDate.setDate(now.getDate() - 90);
                break;
            default:
                startDate.setDate(now.getDate() - 7);
        }
        return startDate;
    }

    private platformTypeToPlatformName(type: PlatformType): PlatformName | null {
        const map: Partial<Record<PlatformType, PlatformName>> = {
            [PlatformType.X]: PlatformName.X,
            [PlatformType.INSTAGRAM]: PlatformName.INSTAGRAM,
            [PlatformType.TIKTOK]: PlatformName.TIKTOK,
            [PlatformType.YOUTUBE]: PlatformName.YOUTUBE,
        };
        return map[type] || null;
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get follower counts for all connected platforms for a tenant
     */
    async getFollowerCounts(tenantId: string): Promise<{
        platform: string;
        displayName: string;
        followerCount: number;
        profilePictureUrl?: string;
        username?: string;
    }[]> {
        const results: {
            platform: string;
            displayName: string;
            followerCount: number;
            profilePictureUrl?: string;
            username?: string;
        }[] = [];

        // Get all platforms that have credentials for this tenant
        const platforms = [
            PlatformName.INSTAGRAM,
            PlatformName.TIKTOK,
            PlatformName.YOUTUBE,
            PlatformName.X,
        ];

        for (const platformName of platforms) {
            try {
                const credentials = await this.credentialsService.getTenantCredentials(tenantId, platformName);
                if (credentials.length === 0) continue;

                const credential = credentials[0];
                const accessToken = await this.credentialsService.getDecryptedAccessToken(credential.id);
                if (!accessToken) continue;

                const gateway = this.postGatewayFactory.getGateway(
                    this.platformNameToPlatformType(platformName)!,
                );

                let followerData: typeof results[0] | null = null;

                if (platformName === PlatformName.INSTAGRAM && 'getAccountInfo' in gateway) {
                    const info = await (gateway as any).getAccountInfo(credential.accountId, accessToken);
                    followerData = {
                        platform: 'INSTAGRAM',
                        displayName: info.displayName,
                        followerCount: info.followerCount,
                        profilePictureUrl: info.profilePictureUrl,
                        username: info.username,
                    };
                } else if (platformName === PlatformName.TIKTOK && 'getAccountInfo' in gateway) {
                    const info = await (gateway as any).getAccountInfo(accessToken);
                    followerData = {
                        platform: 'TIKTOK',
                        displayName: info.displayName,
                        followerCount: info.followerCount,
                        profilePictureUrl: info.profilePictureUrl,
                    };
                } else if (platformName === PlatformName.YOUTUBE && 'getAccountInfo' in gateway) {
                    const info = await (gateway as any).getAccountInfo(accessToken);
                    followerData = {
                        platform: 'YOUTUBE',
                        displayName: info.displayName,
                        followerCount: info.followerCount,
                        profilePictureUrl: info.profilePictureUrl,
                    };
                } else if (platformName === PlatformName.X && 'getAccountInfo' in gateway) {
                    // X uses accountName (username) for lookups
                    const username = credential.accountName?.replace('@', '');
                    if (username) {
                        const info = await (gateway as any).getAccountInfo(username);
                        followerData = {
                            platform: 'X',
                            displayName: info.displayName,
                            followerCount: info.followerCount,
                            profilePictureUrl: info.profilePictureUrl,
                            username: info.username,
                        };
                    }
                }

                if (followerData) {
                    results.push(followerData);
                }
            } catch (error: any) {
                this.logger.warn(`[Analytics] Failed to get follower count for ${platformName}: ${error.message}`);
            }
        }

        return results;
    }

    private platformNameToPlatformType(name: PlatformName): PlatformType | null {
        const map: Partial<Record<PlatformName, PlatformType>> = {
            [PlatformName.X]: PlatformType.X,
            [PlatformName.INSTAGRAM]: PlatformType.INSTAGRAM,
            [PlatformName.TIKTOK]: PlatformType.TIKTOK,
            [PlatformName.YOUTUBE]: PlatformType.YOUTUBE,
        };
        return map[name] || null;
    }
}
