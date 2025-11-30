import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { Post, PostStatus } from '../entities/post.entity';
import { PublishedPost } from '../entities/published-post.entity';
import { PlatformType } from '../enums/platform-type.enum';
import { PostGatewayFactory } from './post-gateway.factory';
import { CredentialsService } from 'src/credentials/credential.service';
import { PlatformName } from '../entities/credential.entity';
import { UploadService } from 'src/upload/upload.service';
import { CreatePostInput } from 'src/graphql/inputs/post.input';
import { QUEUE_NAMES, ASYNC_POLLING_JOBS } from 'src/queue/queue.config';
import { AsyncPostGateway } from './gateways/async-post.gateway';

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
    private readonly postGatewayFactory: PostGatewayFactory,
    private readonly credentialsService: CredentialsService,
    private readonly uploadService: UploadService,
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
    });

    return this.postRepository.save(post);
  }

  async getUserPosts(
    userId: string,
    tenantId: string,
    limit = 50,
  ): Promise<Post[]> {
    // Get ALL posts from the organization (not just the user's posts)
    return this.postRepository.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      take: limit,
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
      relations: ['publishedPosts'],
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

    // Reset failure reasons when editing a failed post
    if (post.status === PostStatus.FAILED) {
      post.failureReasons = undefined;
    }

    return this.postRepository.save(post);
  }

  async deletePost(
    postId: string,
    userId: string,
    tenantId: string,
  ): Promise<boolean> {
    const post = await this.getPost(postId, userId, tenantId);
    const urls = post.mediaUrls || [];
    await this.uploadService.deleteFileByUrl(urls);
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
          const result = await gateway.createNewPost(
            userId,
            post.content,
            access_token,
            post.mediaUrls,
            { username: credential.accountName },
          );

          // 3️⃣ Notify gateway & persist
          await gateway.notifyPostPublished(post.id, platform, result);

          const publishedPost = this.publishedPostRepository.create({
            postId: post.id,
            platform: platform,
            publishedAt: new Date(),
            platformPostId: result.id,
            platformPostUrl: result.url || 'pending',
            publishMetadata: result,
            publishId: result.publish_id || undefined,
            publishStatus: result.publish_id ? 'PROCESSING_UPLOAD' : undefined,
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
      post.status = PostStatus.PUBLISHED;

      // Save all published posts
      const savedPublishedPosts = await this.publishedPostRepository.save(publishResults);

      // Enqueue async polling jobs for saved posts
      for (const savedPost of savedPublishedPosts) {
        const jobData = (savedPost as any).asyncJobData;
        if (jobData) {
          // Update with actual saved ID
          jobData.publishedPostId = savedPost.id;

          await this.asyncPollingQueue.add(
            ASYNC_POLLING_JOBS.POLL_STATUS,
            jobData,
            {
              delay: 5000, // Start polling after 5 seconds
              attempts: 15, // Poll up to 15 times
              backoff: {
                type: 'exponential',
                delay: 5000, // 5s, 10s, 20s, 40s... up to ~5 minutes total
              },
            },
          );

          this.logger.log(
            `[${jobData.platform}] Enqueued async polling job for publish_id: ${jobData.publish_id}`,
          );
        }
      }

      post.failureReasons = undefined; // Clear any previous failures
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
    return this.getPost(postId, userId, tenantId);
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

    if (post.status !== PostStatus.FAILED) {
      throw new Error('Can only retry failed posts');
    }

    // Get platforms that already succeeded
    const publishedPosts = await this.publishedPostRepository.find({
      where: { postId: post.id },
    });
    const succeededPlatforms = publishedPosts.map((p) => p.platform);

    // Filter target platforms to only retry failed ones
    const originalPlatforms = [...post.targetPlatforms];
    const failedPlatforms = originalPlatforms.filter(
      (platform) => !succeededPlatforms.includes(platform as PlatformType),
    );


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
}
