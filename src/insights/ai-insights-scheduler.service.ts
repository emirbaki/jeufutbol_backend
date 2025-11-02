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
  ) {}

  /**
   * Generate insights for all users daily
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDailyInsights() {
    this.logger.log('Starting daily insights generation');

    try {
      const users = await this.userRepository.find({
        where: { isActive: true },
      });

      for (const user of users) {
        try {
          await this.aiInsightsService.generateInsights({
            userId: user.id,
            useVectorSearch: false,
          });
          this.logger.log(`Generated insights for user ${user.id}`);
        } catch (error) {
          this.logger.error(`Failed for user ${user.id}: ${error.message}`);
        }

        // Rate limiting delay
        await this.delay(5000);
      }

      this.logger.log('Daily insights generation complete');
    } catch (error) {
      this.logger.error(`Daily insights failed: ${error.message}`);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
