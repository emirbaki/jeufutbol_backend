import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PubSub } from 'graphql-subscriptions';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from 'src/queue/queue.config';
import { PublishedPost } from 'src/entities/published-post.entity';
import { Post, PostStatus } from 'src/entities/post.entity';
import { PostGatewayFactory } from '../post-gateway.factory';
import {
    AsyncPostGateway,
    AsyncPollingJobData,
} from '../gateways/async-post.gateway';

/**
 * Generic async polling processor for all platforms
 * Handles async post uploads for TikTok, Instagram Reels, etc.
 *
 * Replaces platform-specific processors with a unified approach
 */
@Processor(QUEUE_NAMES.ASYNC_POST_POLLING)
export class AsyncPollingProcessor extends WorkerHost {
    private readonly logger = new Logger(AsyncPollingProcessor.name);

    constructor(
        @InjectRepository(PublishedPost)
        private publishedPostRepository: Repository<PublishedPost>,
        @InjectRepository(Post)
        private postRepository: Repository<Post>,
        private postGatewayFactory: PostGatewayFactory,
        @Inject('PUB_SUB') private readonly pubSub: PubSub,
    ) {
        super();
    }

    async process(job: Job<AsyncPollingJobData>): Promise<void> {
        const { publishedPostId, publish_id, access_token, platform, metadata } =
            job.data;

        this.logger.log(
            `[Job ${job.id}] Polling ${platform} status for publish_id: ${publish_id}`,
        );

        try {
            // 1️⃣ Get the appropriate gateway
            const gateway = this.postGatewayFactory.getGateway(platform);

            if (!(gateway instanceof AsyncPostGateway)) {
                throw new Error(
                    `Gateway for ${platform} does not support async polling`,
                );
            }

            // 2️⃣ Call platform's checkPublishStatus
            const statusData = await gateway.checkPublishStatus(
                publish_id,
                access_token,
            );

            this.logger.log(
                `[Job ${job.id}] ${platform} status: ${statusData.status}`,
            );

            // 3️⃣ Load the PublishedPost entity
            const publishedPost = await this.publishedPostRepository.findOne({
                where: { id: publishedPostId },
                relations: ['post'],
            });

            if (!publishedPost) {
                throw new Error(`PublishedPost ${publishedPostId} not found`);
            }

            // 4️⃣ Handle different statuses based on platform response
            const status = statusData.status.toUpperCase();

            if (
                status === 'PUBLISH_COMPLETE' ||
                status === 'FINISHED' ||
                status === 'PUBLISHED'
            ) {
                // ✅ Upload complete - call platform-specific completion if needed
                try {
                    // Pass postId from status check to completion (TikTok needs this for URL)
                    const completionMetadata = {
                        ...(metadata || {}),
                        postId: statusData.postId,
                    };

                    const completionResult = await gateway.completePublish(
                        publish_id,
                        access_token,
                        completionMetadata,
                    );

                    // Update with completion results
                    if (completionResult.postId) {
                        publishedPost.platformPostId = completionResult.postId;
                    }
                    if (completionResult.postUrl) {
                        publishedPost.platformPostUrl = completionResult.postUrl;
                    }
                } catch (error: any) {
                    this.logger.error(
                        `[Job ${job.id}] Error completing publish: ${error.message}`,
                    );
                    // Don't fail the entire job if completion fails
                    // Some platforms don't need completion step
                }

                // Also use any postId/postUrl from the status check
                if (statusData.postId && !publishedPost.platformPostId) {
                    publishedPost.platformPostId = statusData.postId;
                }
                if (statusData.postUrl && !publishedPost.platformPostUrl) {
                    publishedPost.platformPostUrl = statusData.postUrl;
                }

                publishedPost.publishStatus = 'PUBLISH_COMPLETE';

                await this.publishedPostRepository.save(publishedPost);

                // Update Post status to PUBLISHED if not already
                if (publishedPost.post.status !== PostStatus.PUBLISHED) {
                    await this.postRepository.update(publishedPost.postId, {
                        status: PostStatus.PUBLISHED,
                        failureReasons: undefined,
                    });
                }

                // Publish update
                const updatedPost = await this.postRepository.findOne({ where: { id: publishedPost.postId }, relations: ['publishedPosts'] });
                if (updatedPost) {
                    this.pubSub.publish('postUpdated', { postUpdated: updatedPost });
                }

                this.logger.log(
                    `[Job ${job.id}] ✅ ${platform} post published successfully: ${publishedPost.platformPostUrl || publishedPost.platformPostId}`,
                );
            } else if (status === 'FAILED' || status === 'ERROR') {
                // ❌ Upload failed
                publishedPost.publishStatus = 'FAILED';
                publishedPost.publishMetadata = {
                    ...publishedPost.publishMetadata,
                    fail_reason: statusData.failReason,
                };

                await this.publishedPostRepository.save(publishedPost);

                // Update Post status to FAILED
                await this.postRepository.update(publishedPost.postId, {
                    status: PostStatus.FAILED,
                    failureReasons: {
                        [platform.toLowerCase()]: statusData.failReason || 'Upload failed',
                    },
                });

                // Publish update
                const updatedPost = await this.postRepository.findOne({ where: { id: publishedPost.postId }, relations: ['publishedPosts'] });
                if (updatedPost) {
                    this.pubSub.publish('postUpdated', { postUpdated: updatedPost });
                }

                this.logger.error(
                    `[Job ${job.id}] ❌ ${platform} upload failed: ${statusData.failReason}`,
                );

                throw new Error(`${platform} upload failed: ${statusData.failReason}`);
            } else {
                // ⏳ Still processing - update status and retry
                publishedPost.publishStatus = statusData.status;
                await this.publishedPostRepository.save(publishedPost);

                // Publish update (optional, but good for progress tracking)
                const updatedPost = await this.postRepository.findOne({ where: { id: publishedPost.postId }, relations: ['publishedPosts'] });
                if (updatedPost) {
                    this.pubSub.publish('postUpdated', { postUpdated: updatedPost });
                }

                this.logger.log(
                    `[Job ${job.id}] ⏳ Still processing (${statusData.status}), will retry...`,
                );

                // Throw error to trigger BullMQ retry with backoff
                throw new Error(`Still processing: ${statusData.status}`);
            }
        } catch (error: any) {
            this.logger.error(
                `[Job ${job.id}] Error polling ${platform} status: ${error.message}`,
            );
            throw error; // Re-throw to let BullMQ handle retries
        }
    }
}
