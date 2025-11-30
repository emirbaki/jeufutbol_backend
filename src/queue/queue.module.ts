import { Module, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { getQueueConfig, QUEUE_NAMES } from './queue.config';
import { QueueHealthService } from './queue-health.service';
import { JobService } from './job.service';
import { JobResolver } from './job.resolver';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const config = getQueueConfig(configService);
        return {
          connection: config.connection,
          defaultJobOptions: config.defaultJobOptions,
        };
      },
      inject: [ConfigService],
    }),
    // Register queues
    BullModule.registerQueue(
      {
        name: QUEUE_NAMES.AI_INSIGHTS,
      },
      {
        name: QUEUE_NAMES.TWEET_MONITORING,
      },
      {
        name: QUEUE_NAMES.EMAIL_NOTIFICATIONS,
      },
    ),
  ],
  providers: [QueueHealthService, JobService, JobResolver],
  exports: [BullModule, QueueHealthService, JobService],
})
export class QueueModule {}
