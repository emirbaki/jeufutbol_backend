import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnalyticsService } from './analytics.service';
import { AnalyticsSettings } from '../entities/analytics-settings.entity';
import { Tenant } from '../entities/tenant.entity';

@Injectable()
export class AnalyticsSchedulerService {
    private readonly logger = new Logger(AnalyticsSchedulerService.name);

    constructor(
        private analyticsService: AnalyticsService,
        @InjectRepository(Tenant)
        private tenantRepository: Repository<Tenant>,
        @InjectRepository(AnalyticsSettings)
        private settingsRepository: Repository<AnalyticsSettings>,
    ) { }

    /**
     * Check all tenants hourly and refresh analytics based on their individual settings
     */
    @Cron('0 * * * *') // Every hour (at :00 minute)
    async handleScheduledAnalyticsRefresh() {
        this.logger.log('Checking tenants for scheduled analytics refresh');

        try {
            const tenants = await this.tenantRepository.find();
            let refreshedCount = 0;

            for (const tenant of tenants) {
                try {
                    const shouldRefresh = await this.shouldRefreshTenant(tenant.id);

                    if (shouldRefresh) {
                        await this.analyticsService.refreshTenantAnalytics(tenant.id);
                        this.logger.log(`Analytics refreshed for tenant: ${tenant.id}`);
                        refreshedCount++;

                        // Small delay between tenants to avoid API rate limits
                        await this.delay(2000);
                    }
                } catch (error: any) {
                    this.logger.error(
                        `Failed to refresh analytics for tenant ${tenant.id}: ${error.message}`,
                    );
                }
            }

            this.logger.log(
                `Analytics check completed: ${refreshedCount}/${tenants.length} tenants refreshed`,
            );
        } catch (error: any) {
            this.logger.error(
                `Scheduled analytics check failed: ${error.message}`,
            );
        }
    }

    /**
     * Check if a tenant's analytics should be refreshed based on their settings
     */
    private async shouldRefreshTenant(tenantId: string): Promise<boolean> {
        const settings = await this.settingsRepository.findOne({
            where: { tenantId },
        });

        // If no settings exist, use default (refresh every 6 hours)
        if (!settings) {
            return true; // No settings = first refresh needed
        }

        // If never refreshed before, do it now
        if (!settings.lastRefreshAt) {
            return true;
        }

        // Check if enough time has passed based on tenant's preference
        const hoursSinceLastRefresh =
            (Date.now() - new Date(settings.lastRefreshAt).getTime()) / (1000 * 60 * 60);

        return hoursSinceLastRefresh >= settings.refreshIntervalHours;
    }

    private delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
