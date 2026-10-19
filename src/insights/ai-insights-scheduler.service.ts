import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AIInsightsService } from './ai-insights.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MonitoredProfile } from '../entities/monitored-profile.entity';

@Injectable()
export class AIInsightsSchedulerService {
  private readonly logger = new Logger(AIInsightsSchedulerService.name);

  constructor(
    private aiInsightsService: AIInsightsService,
    @InjectRepository(MonitoredProfile)
    private monitoredProfileRepository: Repository<MonitoredProfile>,
  ) {}

  /**
   * Generate insights daily, one job for each workspace with active
   * monitored profiles. The job runs as the user of the oldest profile.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDailyInsights() {
    this.logger.log('Starting daily insights generation (queue-based)');

    try {
      const profiles = await this.monitoredProfileRepository.find({
        where: { isActive: true },
        order: { createdAt: 'ASC' },
      });

      const workspaces = new Map<string, MonitoredProfile>();
      for (const profile of profiles) {
        if (profile.workspaceId && !workspaces.has(profile.workspaceId)) {
          workspaces.set(profile.workspaceId, profile);
        }
      }

      for (const [workspaceId, profile] of workspaces) {
        try {
          // Enqueue job instead of running directly
          const { jobId } = await this.aiInsightsService.generateInsights({
            userId: profile.userId,
            tenantId: profile.tenantId,
            workspaceId,
            useVectorSearch: false,
          });
          this.logger.log(`Enqueued insights job ${jobId} for workspace ${workspaceId}`);
        } catch (error) {
          this.logger.error(
            `Failed to enqueue job for workspace ${workspaceId}: ${error.message}`,
          );
        }

        // Small delay to avoid bursts (jobs will be processed by workers)
        await this.delay(1000);
      }

      this.logger.log(`Daily insights jobs enqueued for ${workspaces.size} workspaces`);
    } catch (error) {
      this.logger.error(`Daily insights scheduling failed: ${error.message}`);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
