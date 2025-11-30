import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import { QUEUE_NAMES, TIKTOK_POLLING_JOBS } from 'src/queue/queue.config';
import { PublishedPost } from 'src/entities/published-post.entity';
import { Post, PostStatus } from 'src/entities/post.entity';
import { TiktokPostGateway } from '../gateways/tiktok.gateway';

export interface TikTokPollingJobData {
    publishedPostId: string;
    publish_id: string;
    access_token: string;
    username: string;
    mediaType: 'video' | 'photo';
}

@Processor(QUEUE_NAMES.TIKTOK_POLLING)
export class TiktokPollingProcessor extends WorkerHost {
    private readonly logger = new Logger(TiktokPollingProcessor.name);

    constructor(
        @InjectRepository(PublishedPost)
        private publishedPostRepository: Repository<PublishedPost>,
        @InjectRepository(Post)
        private postRepository: Repository<Post>,
        private tiktokGateway: TiktokPostGateway,
    ) {
        super();
    }

    async process(job: Job<TikTokPollingJobData>): Promise<void> {
        const { publishedPostId, publish_id, access_token, username, mediaType } =
            job.data;

        this.logger.log(
            `[Job ${job.id}] Polling TikTok status for publish_id: ${publish_id}`,
        );

        try {
            // 1️⃣ Call TikTok status API
            const statusData = await this.tiktokGateway.checkPublishStatus(
                publish_id,
                access_token,
            );

            this.logger.log(
                `[Job ${job.id}] TikTok status: ${statusData.status}`,
            );

            // 2️⃣ Load the PublishedPost entity
            const publishedPost = await this.publishedPostRepository.findOne({
                where: { id: publishedPostId },
                relations: ['post'],
            });

            if (!publishedPost) {
                throw new Error(`PublishedPost ${publishedPostId} not found`);
            }

            // 3️⃣ Handle different statuses
            if (statusData.status === 'PUBLISH_COMPLETE') {
                // Extract the final post ID
                const postIds = statusData.postId || [];

                // Log the full response for debugging
                this.logger.log(
                    `[Job ${job.id}] TikTok status data: ${JSON.stringify(statusData)}`,
                );

                if (postIds.length === 0) {
                    this.logger.error(
                        `[Job ${job.id}] TikTok returned PUBLISH_COMPLETE but no publicly_available_post_id. This may be a private post or under moderation.`,
                    );
                    throw new Error('No publicly_available_post_id returned by TikTok');
                }

                const finalPostId = postIds[0];
                this.logger.log(
                    `[Job ${job.id}] Using publicly_available_post_id: ${finalPostId}`,
                );

                // Construct the final URL
                const urlPath = mediaType === 'video' ? 'video' : 'photo';
                const finalUrl = `https://www.tiktok.com/@${username}/${urlPath}/${finalPostId}`;

                // Update PublishedPost with final URL and status
                publishedPost.platformPostId = finalPostId;
                publishedPost.platformPostUrl = finalUrl;
                publishedPost.publishStatus = 'PUBLISH_COMPLETE';

                await this.publishedPostRepository.save(publishedPost);

                // Update Post status to PUBLISHED if not already
                if (publishedPost.post.status !== PostStatus.PUBLISHED) {
                    await this.postRepository.update(publishedPost.postId, {
                        status: PostStatus.PUBLISHED,
                        failureReasons: undefined,
                    });
                }

                this.logger.log(
                    `[Job ${job.id}] ✅ TikTok post published successfully: ${finalUrl}`,
                );
            } else if (statusData.status === 'FAILED') {
                // Mark as failed
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
                        tiktok: statusData.failReason || 'Upload failed',
                    },
                });

                this.logger.error(
                    `[Job ${job.id}] ❌ TikTok upload failed: ${statusData.failReason}`,
                );

                throw new Error(`TikTok upload failed: ${statusData.failReason}`);
            } else {
                // Status is PROCESSING_UPLOAD or similar - update status and retry
                publishedPost.publishStatus = statusData.status;
                await this.publishedPostRepository.save(publishedPost);

                this.logger.log(
                    `[Job ${job.id}] ⏳ Still processing (${statusData.status}), will retry...`,
                );

                // Throw error to trigger BullMQ retry with backoff
                throw new Error(`Still processing: ${statusData.status}`);
            }
        } catch (error: any) {
            this.logger.error(
                `[Job ${job.id}] Error polling TikTok status: ${error.message}`,
            );
            throw error; // Re-throw to let BullMQ handle retries
        }
    }
}
