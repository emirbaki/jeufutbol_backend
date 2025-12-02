import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from './queue.config';

@Injectable()
export class QueueHealthService implements OnModuleInit {
  private readonly logger = new Logger(QueueHealthService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.AI_INSIGHTS)
    private aiInsightsQueue: Queue,
    @InjectQueue(QUEUE_NAMES.TWEET_MONITORING)
    private monitoringQueue: Queue,
  ) {}

  async onModuleInit() {
    try {
      // Test Redis connection
      const client = await this.aiInsightsQueue.client;
      await client.ping();
      this.logger.log('✅ Redis connection established successfully');

      // Log queue names
      this.logger.log(
        `✅ Queues registered: ${Object.values(QUEUE_NAMES).join(', ')}`,
      );
    } catch (error) {
      this.logger.error(`❌ Redis connection failed: ${error.message}`);
      this.logger.warn('Queues will not work until Redis is available');
    }
  }

  async getQueueStats() {
    const stats = await Promise.all([
      this.getQueueInfo(this.aiInsightsQueue, 'AI Insights'),
      this.getQueueInfo(this.monitoringQueue, 'Tweet Monitoring'),
    ]);

    return stats;
  }

  private async getQueueInfo(queue: Queue, name: string) {
    const [waiting, active, completed, failed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
    ]);

    return {
      name,
      waiting,
      active,
      completed,
      failed,
    };
  }
}
