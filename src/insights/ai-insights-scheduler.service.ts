import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AIInsightsService } from './ai-insights.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';

@Injectable()
export class AIInsightsSchedulerService {
  private readonly logger = new Logger(AIInsightsSchedulerService.name);

  constructor(
    private aiInsightsService: AIInsightsService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) { }

  /**
   * Generate insights for all users daily (Now using queues!)
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDailyInsights() {
    this.logger.log('Starting daily insights generation (queue-based)');

    try {
      const users = await this.userRepository.find({
        where: { isActive: true },
      });

      for (const user of users) {
        try {
          // Enqueue job instead of running directly
          const { jobId } = await this.aiInsightsService.generateInsights({
            userId: user.id,
            useVectorSearch: false,
            tenantId: user.tenantId,
          });
          this.logger.log(`Enqueued insights job ${jobId} for user ${user.id}`);
        } catch (error) {
          this.logger.error(`Failed to enqueue job for user ${user.id}: ${error.message}`);
        }

        // Small delay to avoid bursts (jobs will be processed by workers)
        await this.delay(1000);
      }

      this.logger.log(`Daily insights jobs enqueued for ${users.length} users`);
    } catch (error) {
      this.logger.error(`Daily insights scheduling failed: ${error.message}`);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
