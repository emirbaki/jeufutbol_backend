import { Injectable, NotFoundException, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { PubSub } from 'graphql-subscriptions';
import { Post, PostStatus } from '../entities/post.entity';
import { PublishedPost } from '../entities/published-post.entity';
import { PlatformType } from '../enums/platform-type.enum';
import { PostGatewayFactory } from './post-gateway.factory';
import { CredentialsService } from 'src/credentials/credential.service';
import { PlatformName } from '../entities/credential.entity';
import { UploadService } from 'src/upload/upload.service';
import { CreatePostInput } from 'src/graphql/inputs/post.input';
import { QUEUE_NAMES, ASYNC_POLLING_JOBS, SCHEDULED_POST_JOBS } from 'src/queue/queue.config';
import { AsyncPostGateway } from './gateways/async-post.gateway';
import { PublishMode, ScheduledPostJobData } from './processors/scheduled-post.processor';
import { TikTokCreatorInfo } from 'src/graphql/types/tiktok.type';
import { TiktokPostGateway } from './gateways/tiktok.gateway';

export type { PublishMode } from './processors/scheduled-post.processor';
export type PublishJobState = 'waiting' | 'delayed' | 'active' | 'none';


@Injectable()
export class PostsService {
  private readonly logger = new Logger(PostsService.name);

  constructor(
    @InjectRepository(Post)
    private postRepository: Repository<Post>,
    @InjectRepository(PublishedPost)
    private publishedPostRepository: Repository<PublishedPost>,
    @InjectQueue(QUEUE_NAMES.ASYNC_POST_POLLING)
    private asyncPollingQueue: Queue,
    @InjectQueue(QUEUE_NAMES.SCHEDULED_POSTS)
    private scheduledPostsQueue: Queue,
    @Inject('PUB_SUB') private readonly pubSub: PubSub,
    private readonly postGatewayFactory: PostGatewayFactory,
    private readonly credentialsService: CredentialsService,
    private readonly uploadService: UploadService,
    private readonly tiktokGateway: TiktokPostGateway,
  ) { }


  async createPost(
    userId: string,
    tenantId: string,
    dto: CreatePostInput,
  ): Promise<Post> {
    const post = this.postRepository.create({
      userId,
      tenantId,
      content: dto.content,
      mediaUrls: dto.mediaUrls || [],
      targetPlatforms: dto.targetPlatforms,
      platformSpecificContent: dto.platformSpecificContent || {},
      scheduledFor: dto.scheduledFor,
      status: dto.scheduledFor ? PostStatus.SCHEDULED : PostStatus.DRAFT,
      tiktokSettings: dto.tiktokSettings ? {
        title: dto.tiktokSettings.title,
        privacy_level: dto.tiktokSettings.privacy_level,
        allow_comment: dto.tiktokSettings.allow_comment,
        allow_duet: dto.tiktokSettings.allow_duet,
        allow_stitch: dto.tiktokSettings.allow_stitch,
        is_brand_organic: dto.tiktokSettings.is_brand_organic,
        is_branded_content: dto.tiktokSettings.is_branded_content,
        auto_add_music: dto.tiktokSettings.auto_add_music,
      } : undefined,
      youtubeSettings: dto.youtubeSettings ? {
        title: dto.youtubeSettings.title,
        privacy_status: dto.youtubeSettings.privacy_status,
        category_id: dto.youtubeSettings.category_id,
        tags: dto.youtubeSettings.tags,
        is_short: dto.youtubeSettings.is_short,
        made_for_kids: dto.youtubeSettings.made_for_kids,
        notify_subscribers: dto.youtubeSettings.notify_subscribers,
      } : undefined,
      instagramSettings: dto.instagramSettings ? {
        isTrialReel: dto.instagramSettings.isTrialReel,
        graduationStrategy: dto.instagramSettings.graduationStrategy,
      } : undefined,
    });


    const savedPost = await this.postRepository.save(post);

    // Schedule the job if needed
    if (savedPost.status === PostStatus.SCHEDULED && savedPost.scheduledFor) {
      await this.schedulePostJob(savedPost);
    }

    return savedPost;
  }

  private async schedulePostJob(post: Post) {
    if (!post.scheduledFor) return;

    const delay = new Date(post.scheduledFor).getTime() - Date.now();
    if (delay <= 0) return; // Should be published immediately if in past, but we'll let user handle that or logic elsewhere

    const jobData: ScheduledPostJobData = {
      postId: post.id,
      userId: post.userId,
      tenantId: post.tenantId,
    };

    await this.scheduledPostsQueue.add(
      SCHEDULED_POST_JOBS.PUBLISH_POST,
      jobData,
      {
        delay,
        jobId: `publish-post-${post.id}`, // Deterministic ID for easy removal
        removeOnComplete: true,
      },
    );

    this.logger.log(`Scheduled post ${post.id} for ${post.scheduledFor}`);
  }

  private async removeScheduledJob(postId: string) {
    const job = await this.scheduledPostsQueue.getJob(`publish-post-${postId}`);
    if (job) {
      await job.remove();
      this.logger.log(`Removed scheduled job for post ${postId}`);
    }
  }

  /**
   * Publish (or retry) a post in the background through the scheduled-posts queue,
   * so the platform uploads do not run inside the HTTP request.
   * A delayed (scheduled) job for the post is replaced by the new one.
   */
  async enqueuePublish(
    postId: string,
    userId: string,
    tenantId: string,
    mode: PublishMode,
  ): Promise<{ postId: string; jobState: 'waiting' }> {
    const post = await this.getPost(postId, userId, tenantId);
    if (mode === 'publish' && post.status === PostStatus.PUBLISHED)
      throw new Error('Post already published');
    // A full publish posts the same media again to the platforms that are live.
    if (mode === 'publish' && this.hasLivePlatforms(post))
      throw new Error(
        'This post is live on some platforms. Call retry_publish_post to publish to the other platforms.',
      );
    // Check before touching the queue: a retry job on a SCHEDULED post would
    // remove its delayed job and then fail in the worker.
    if (mode === 'retry' && !this.canRetry(post))
      throw new Error('Can only retry failed or partially published posts');

    const jobId = `publish-post-${post.id}`;
    const existing = await this.scheduledPostsQueue.getJob(jobId);
    if (existing) {
      const state = this.toPublishJobState(await existing.getState());
      if (state === 'waiting' || state === 'active')
        throw new Error('A publish for this post is already in progress.');
      // failed, completed or delayed: remove it so the job ID is free
      await existing.remove();
    }

    const jobData: ScheduledPostJobData = { postId: post.id, userId, tenantId, mode };
    await this.scheduledPostsQueue.add(SCHEDULED_POST_JOBS.PUBLISH_POST, jobData, {
      jobId,
      delay: 0,
      attempts: 1, // never retry automatically: a retry after a partial publish posts twice
      removeOnComplete: true,
    });

    this.logger.log(`Enqueued ${mode} for post ${post.id}`);
    return { postId: post.id, jobState: 'waiting' };
  }

  /** True when a platform has a published post row that did not fail. */
  private hasLivePlatforms(post: Post): boolean {
    return (post.publishedPosts ?? []).some((p) => p.publishStatus !== 'FAILED');
  }

  /** True when a target platform has a published post row that did not fail. */
  private isLiveOnTargetPlatforms(post: Post): boolean {
    return (post.publishedPosts ?? []).some(
      (p) =>
        p.publishStatus !== 'FAILED' &&
        post.targetPlatforms.includes(p.platform),
    );
  }

  /**
   * A DRAFT or SCHEDULED post can be retried only when it is live on some
   * platforms (for example after update_post on a failed post).
   */
  private canRetry(post: Post): boolean {
    if (post.status === PostStatus.DRAFT || post.status === PostStatus.SCHEDULED)
      return this.hasLivePlatforms(post);
    return true;
  }

  async getPublishJobState(postId: string): Promise<PublishJobState> {
    const job = await this.scheduledPostsQueue.getJob(`publish-post-${postId}`);
    if (!job) return 'none';
    return this.toPublishJobState(await job.getState());
  }

  private toPublishJobState(state: string): PublishJobState {
    switch (state) {
      case 'active':
        return 'active';
      case 'delayed':
        return 'delayed';
      case 'waiting':
      case 'prioritized':
      case 'waiting-children':
        return 'waiting';
      default:
        return 'none'; // completed, failed, unknown
    }
  }

  async getUserPosts(
    userId: string,
    tenantId: string,
    limit = 50,
    offset = 0,
    status?: PostStatus,
  ): Promise<Post[]> {
    // Get ALL posts from the organization (not just the user's posts)
    return this.postRepository.find({
      where: status ? { tenantId, status } : { tenantId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
      relations: ['publishedPosts', 'user'], // Include user relation to show who created each post
    });
  }

  async getPost(
    postId: string,
    userId: string,
    tenantId: string,
  ): Promise<Post> {
    const post = await this.postRepository.findOne({
      where: { id: postId, userId, tenantId },
      relations: ['publishedPosts', 'tenant', 'user'],
    });

    if (!post) throw new NotFoundException('Post not found');
    return post;
  }

  async updatePost(
    postId: string,
    userId: string,
    tenantId: string,
    updates: Partial<CreatePostInput>,
  ): Promise<Post> {
    const post = await this.getPost(postId, userId, tenantId);

    // Only block editing of successfully published posts
    if (post.status === PostStatus.PUBLISHED)
      throw new Error('Cannot update a published post');

    // Allow editing DRAFT, SCHEDULED, and FAILED posts
    Object.assign(post, updates);

    // Update status based on scheduledFor
    if (post.scheduledFor) {
      post.status = PostStatus.SCHEDULED;
    } else {
      post.status = PostStatus.DRAFT;
    }

    // Reset failure reasons when editing
    post.failureReasons = undefined;

    const savedPost = await this.postRepository.save(post);

    // Handle rescheduling
    if (savedPost.status === PostStatus.SCHEDULED) {
      // Remove existing job first (to be safe/clean)
      await this.removeScheduledJob(postId);
      // Add new job
      await this.schedulePostJob(savedPost);
    } else {
      // If status changed to DRAFT or something else, remove the job
      await this.removeScheduledJob(postId);
    }

    // Reload with relations for subscription
    const postWithRelations = await this.postRepository.findOne({
      where: { id: savedPost.id },
      relations: ['user', 'tenant', 'publishedPosts'],
    });

    if (postWithRelations) {
      await this.pubSub.publish('postUpdated', { postUpdated: postWithRelations });
    }

    return savedPost;
  }

  async deletePost(
    postId: string,
    userId: string,
    tenantId: string,
  ): Promise<boolean> {
    const post = await this.getPost(postId, userId, tenantId);
    const urls = post.mediaUrls || [];
    await this.uploadService.deleteFileByUrl(urls);
    await this.removeScheduledJob(postId);
    await this.postRepository.remove(post);
    return true;
  }
  async publishPost(
    postId: string,
    userId: string,
    tenantId: string,
  ): Promise<Post> {
    const post = await this.getPost(postId, userId, tenantId);
    if (post.status === PostStatus.PUBLISHED)
      throw new Error('Post already published');
    // The scheduled job and the GraphQL resolver call this method directly.
    // retryPublishPost narrows targetPlatforms first, so it passes this check.
    if (this.isLiveOnTargetPlatforms(post))
      throw new Error(
        'This post is live on some platforms. Call retry_publish_post to publish to the other platforms.',
      );

    const gateways = this.postGatewayFactory.getMany(
      post.targetPlatforms as PlatformType[],
    );

    const publishResults: PublishedPost[] = [];
    const errors: Array<{ platform: PlatformType; error: string }> = [];

    await Promise.allSettled(
      gateways.map(async (gateway, index) => {
        const platform = post.targetPlatforms[index] as PlatformType;

        try {
          // 1️⃣ Get credential for platform
          const credentials = await this.credentialsService.getUserCredentials(
            userId,
            tenantId,
            platform as unknown as PlatformName,
          );

          if (credentials.length === 0) {
            throw new Error(`No credentials found for ${platform}`);
          }

          // Use first available credential
          const credential = credentials[0];
          const access_token = await this.credentialsService.getAccessToken(
            credential.id,
            userId,
            tenantId,
          );

          // 2️⃣ Let the gateway handle posting logic
          const contentToPublish =
            post.platformSpecificContent?.[platform] || post.content;

          // Build gateway options - include platform-specific settings
          const gatewayOptions: any = { username: credential.accountName };
          if (platform === PlatformType.TIKTOK && post.tiktokSettings) {
            gatewayOptions.tiktokSettings = post.tiktokSettings;
          }
          if (platform === PlatformType.YOUTUBE && post.youtubeSettings) {
            gatewayOptions.youtubeSettings = post.youtubeSettings;
          }
          if (platform === PlatformType.INSTAGRAM && post.instagramSettings) {
            gatewayOptions.instagramSettings = post.instagramSettings;
          }

          const result = await gateway.createNewPost(
            userId,
            contentToPublish,
            access_token,
            post.mediaUrls,
            gatewayOptions,
          );


          // 3️⃣ Notify gateway & persist
          await gateway.notifyPostPublished(post.id, platform, result);

          // Determine publish status:
          // - Async platforms with publish_id: PROCESSING_UPLOAD (will be updated by polling)
          // - Instant platforms (like X): PUBLISH_COMPLETE immediately
          const isAsyncWithPolling = result.publish_id !== undefined;
          const initialStatus = isAsyncWithPolling ? 'PROCESSING_UPLOAD' : 'PUBLISH_COMPLETE';

          const publishedPost = this.publishedPostRepository.create({
            postId: post.id,
            tenantId: tenantId,
            platform: platform,
            publishedAt: new Date(),
            platformPostId: result.id,
            platformPostUrl: result.url || 'pending',
            publishMetadata: result,
            publishId: result.publish_id || undefined,
            publishStatus: initialStatus,
          });

          publishResults.push(publishedPost);

          // 4️⃣ For async gateways, prepare polling job data
          if (gateway instanceof AsyncPostGateway) {
            const jobData = gateway.getPollingJobData(
              publishedPost,
              result,
              access_token,
              {
                username: credential.accountName,
                mediaUrls: post.mediaUrls,
                youtubeSettings: gatewayOptions.youtubeSettings,
              },
            );

            if (jobData) {
              // Store job data for enqueueing after save
              (publishedPost as any).asyncJobData = jobData;
              this.logger.log(
                `[${platform}] Prepared async polling job for publish_id: ${result.publish_id}`,
              );
            }
          }
        } catch (err: any) {
          // const detail = err.response!
          const message = err.message || 'Unknown error';
          errors.push({ platform, error: message });

          await gateway.notifyPostFailed(post.id, message);
        }
      }),
    );

    // 4️⃣ Update post status and save published posts
    if (publishResults.length > 0) {
      if (errors.length > 0) {
        post.status = PostStatus.FAILED;
        post.failureReasons = errors.reduce(
          (acc, err) => {
            acc[err.platform] = err.error;
            return acc;
          },
          {} as Record<string, string>,
        );
      } else {
        post.status = PostStatus.PUBLISHED;
        post.failureReasons = undefined; // Clear any previous failures
      }

      // Save all published posts
      const savedPublishedPosts = await this.publishedPostRepository.save(publishResults);

      // Enqueue async polling jobs for saved posts
      for (const savedPost of savedPublishedPosts) {
        const jobData = (savedPost as any).asyncJobData;
        if (jobData) {
          // Update with actual saved ID
          jobData.publishedPostId = savedPost.id;

          // Platform-specific polling settings
          // TikTok needs more attempts due to content moderation delays
          const isTikTok = jobData.platform === PlatformType.TIKTOK;
          const pollingOptions = {
            delay: 5000, // Start polling after 5 seconds
            attempts: isTikTok ? 30 : 15, // TikTok: 30 attempts for moderation delays
            backoff: {
              type: 'exponential' as const,
              delay: isTikTok ? 10000 : 5000, // TikTok: 10s base, others: 5s
            },
          };

          await this.asyncPollingQueue.add(
            ASYNC_POLLING_JOBS.POLL_STATUS,
            jobData,
            pollingOptions,
          );

          this.logger.log(
            `[${jobData.platform}] Enqueued async polling job for publish_id: ${jobData.publish_id}`,
          );
        }
      }
    } else {
      post.status = PostStatus.FAILED;

      // Store failure reasons for each platform
      post.failureReasons = errors.reduce(
        (acc, err) => {
          acc[err.platform] = err.error;
          return acc;
        },
        {} as Record<string, string>,
      );

      this.logger.error(
        `Publishing failed for all platforms: ${JSON.stringify(errors)}`,
      );
    }

    await this.postRepository.update(post.id, {
      status: post.status,
      failureReasons: post.failureReasons,
    });
    const updatedPost = await this.getPost(postId, userId, tenantId);
    this.pubSub.publish('postUpdated', { postUpdated: updatedPost });
    return updatedPost;
  }

  /**
   * Retry publishing a failed post
   * Only retries platforms that failed (keeps successful platforms)
   */
  async retryPublishPost(
    postId: string,
    userId: string,
    tenantId: string,
  ): Promise<Post> {
    const post = await this.getPost(postId, userId, tenantId);

    if (!this.canRetry(post)) {
      throw new Error('Can only retry failed or partially published posts');
    }

    // Get platforms that already succeeded or are still processing
    const publishedPosts = await this.publishedPostRepository.find({
      where: { postId: post.id },
    });
    const activePlatforms = publishedPosts
      .filter((p) => p.publishStatus !== 'FAILED')
      .map((p) => p.platform);

    // Filter target platforms to only retry failed ones
    const originalPlatforms = [...post.targetPlatforms];
    const failedPlatforms = originalPlatforms.filter(
      (platform) => !activePlatforms.includes(platform as PlatformType),
    );

    // Clean up old failed records so we don't have duplicates when retrying
    const failedPublishedPosts = publishedPosts.filter((p) => p.publishStatus === 'FAILED');
    if (failedPublishedPosts.length > 0) {
      await this.publishedPostRepository.remove(failedPublishedPosts);
    }

    if (failedPlatforms.length === 0) {
      throw new Error('No failed platforms to retry');
    }

    // Temporarily set target platforms to only failed ones
    post.targetPlatforms = failedPlatforms;

    // Reset status to draft for republishing
    post.status = PostStatus.DRAFT;
    post.failureReasons = undefined;
    await this.postRepository.save(post);

    // Publish only to failed platforms
    const result = await this.publishPost(postId, userId, tenantId);

    // Restore original target platforms
    result.targetPlatforms = originalPlatforms;
    await this.postRepository.save(result);

    return result;
  }

  /**
   * Get TikTok creator info for posting compliance
   * Returns privacy options, posting limits, and interaction settings
   * Required by TikTok Content Sharing Guidelines
   */
  async getTikTokCreatorInfo(
    userId: string,
    tenantId: string,
  ): Promise<TikTokCreatorInfo> {
    // Get TikTok credentials for the user
    const credentials = await this.credentialsService.getUserCredentials(
      userId,
      tenantId,
      PlatformName.TIKTOK,
    );

    if (credentials.length === 0) {
      throw new Error('No TikTok credentials found. Please connect your TikTok account first.');
    }

    // Get access token from first available credential
    const access_token = await this.credentialsService.getAccessToken(
      credentials[0].id,
      userId,
      tenantId,
    );

    // Fetch creator info from TikTok API via gateway
    return this.tiktokGateway.getCreatorInfo(access_token);
  }
}

