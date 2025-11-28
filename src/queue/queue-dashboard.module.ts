import { Module } from '@nestjs/common';
import { BullBoardModule } from '@bull-board/nestjs';
import { ExpressAdapter } from '@bull-board/express';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { QUEUE_NAMES } from './queue.config';

@Module({
    imports: [
        BullBoardModule.forRoot({
            route: '/admin/queues',
            adapter: ExpressAdapter,
        }),
        BullBoardModule.forFeature({
            name: QUEUE_NAMES.AI_INSIGHTS,
            adapter: BullMQAdapter,
        }),
        BullBoardModule.forFeature({
            name: QUEUE_NAMES.TWEET_MONITORING,
            adapter: BullMQAdapter,
        }),
        BullBoardModule.forFeature({
            name: QUEUE_NAMES.EMAIL_NOTIFICATIONS,
            adapter: BullMQAdapter,
        }),
    ],
})
export class QueueDashboardModule { }
