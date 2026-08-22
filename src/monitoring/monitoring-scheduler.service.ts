import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MonitoringService } from './monitoring.service';
import { TweetsService } from 'src/tweets/tweets.service';

@Injectable()
export class MonitoringSchedulerService {
  private readonly logger = new Logger(MonitoringSchedulerService.name);

  constructor(
    private monitoringService: MonitoringService,
    private tweetsService: TweetsService,
  ) {}

  /**
   * Refresh all profiles every 24 hours at 3:00 AM (Europe/Istanbul timezone)
   */
  @Cron('0 3 * * *', {
    timeZone: 'Europe/Istanbul',
  })
  async handleDailyRefresh() {
    this.logger.log('Starting daily tweet refresh at 3:00 AM (Turkey time)');

    try {
      const { jobId } = await this.monitoringService.refreshAllProfiles();
      this.logger.log(`Daily refresh job enqueued: ${jobId}`);
    } catch (error) {
      this.logger.error(`Daily refresh failed: ${error.message}`);
    }
  }

  /**
   * Cleanup old tweets weekly
   */
  @Cron(CronExpression.EVERY_WEEK)
  async handleWeeklyCleanup() {
    this.logger.log('Starting weekly cleanup');

    try {
      // Delete tweets older than 90 days
      await this.tweetsService.deleteOldTweets(90);
      this.logger.log('Weekly cleanup complete');
    } catch (error) {
      this.logger.error(`Weekly cleanup failed: ${error.message}`);
    }
  }
}
