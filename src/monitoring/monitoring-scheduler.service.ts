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
  ) { }

  /**
   * Refresh all profiles every hour
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleHourlyRefresh() {
    this.logger.log('Starting hourly tweet refresh');

    try {
      const { jobId } = await this.monitoringService.refreshAllProfiles();
      this.logger.log(
        `Hourly refresh job enqueued: ${jobId}`,
      );
    } catch (error) {
      this.logger.error(`Hourly refresh failed: ${error.message}`);
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
