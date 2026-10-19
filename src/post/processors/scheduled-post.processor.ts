import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Inject } from '@nestjs/common';
import { Job } from 'bullmq';
import { PubSub } from 'graphql-subscriptions';
import { QUEUE_NAMES } from 'src/queue/queue.config';
import { PostsService } from '../post.service';

export type PublishMode = 'publish' | 'retry';

export interface ScheduledPostJobData {
    postId: string;
    userId: string;
    tenantId: string;
    mode?: PublishMode; // missing means 'publish'
}

@Processor(QUEUE_NAMES.SCHEDULED_POSTS)
export class ScheduledPostProcessor extends WorkerHost {
    private readonly logger = new Logger(ScheduledPostProcessor.name);

    constructor(
        private readonly postsService: PostsService,
        @Inject('PUB_SUB') private readonly pubSub: PubSub,
    ) {
        super();
    }

    async process(job: Job<ScheduledPostJobData>): Promise<void> {
        const { postId, userId, mode = 'publish' } = job.data;
        // The job keeps the tenant of the moment it was queued. A tenant merge can move
        // the post later, so the current tenant of the post wins.
        const tenantId = (await this.postsService.getPostTenantId(postId)) ?? job.data.tenantId;

        this.logger.log(`[Job ${job.id}] Processing scheduled post ${postId}`);

        try {
            if (mode === 'retry') {
                await this.postsService.retryPublishPost(postId, userId, tenantId);
            } else {
                await this.postsService.publishPost(postId, userId, tenantId);
            }
            this.logger.log(`[Job ${job.id}] Successfully published post ${postId}`);
        } catch (error) {
            this.logger.error(
                `[Job ${job.id}] Failed to publish post ${postId}: ${error.message}`,
                error.stack,
            );
            throw error; // Let BullMQ handle retries if configured
        }
    }
}
