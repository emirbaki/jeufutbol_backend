import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post, PostStatus } from '../entities/post.entity';
import { PublishedPost } from '../entities/published-post.entity';
import { SocialAccount, PlatformType } from '../entities/social-account.entity';
import { PostGatewayFactory } from './post-gateway.factory';
import { CredentialsService } from 'src/credentials/credential.service';
import { PlatformName } from '../entities/credential.entity';
import { UploadService } from 'src/upload/upload.service';
export interface CreatePostDto {
  content: string;
  mediaUrls?: string[];
  targetPlatforms: PlatformType[];
  platformSpecificContent?: Record<string, any>;
  scheduledFor?: Date;
}

@Injectable()
export class PostsService {
  private readonly logger = new Logger(PostsService.name);

  constructor(
    @InjectRepository(Post)
    private postRepository: Repository<Post>,
    @InjectRepository(PublishedPost)
    private publishedPostRepository: Repository<PublishedPost>,
    @InjectRepository(SocialAccount)
    private socialAccountRepository: Repository<SocialAccount>,
    private readonly postGatewayFactory: PostGatewayFactory,
    private readonly credentialsService: CredentialsService,
    private readonly uploadService: UploadService,
  ) {}

  async createPost(userId: string, dto: CreatePostDto): Promise<Post> {
    const post = this.postRepository.create({
      userId,
      content: dto.content,
      mediaUrls: dto.mediaUrls || [],
      targetPlatforms: dto.targetPlatforms,
      platformSpecificContent: dto.platformSpecificContent || {},
      scheduledFor: dto.scheduledFor,
      status: dto.scheduledFor ? PostStatus.SCHEDULED : PostStatus.DRAFT,
    });

    return this.postRepository.save(post);
  }

  async getUserPosts(userId: string, limit = 50): Promise<Post[]> {
    return this.postRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
      relations: ['publishedPosts'],
    });
  }

  async getPost(postId: string, userId: string): Promise<Post> {
    const post = await this.postRepository.findOne({
      where: { id: postId, userId },
      relations: ['publishedPosts'],
    });

    if (!post) throw new NotFoundException('Post not found');
    return post;
  }

  async updatePost(
    postId: string,
    userId: string,
    updates: Partial<CreatePostDto>,
  ): Promise<Post> {
    const post = await this.getPost(postId, userId);

    if (post.status === PostStatus.PUBLISHED)
      throw new Error('Cannot update a published post');

    Object.assign(post, updates);
    return this.postRepository.save(post);
  }

  async deletePost(postId: string, userId: string): Promise<boolean> {
    const post = await this.getPost(postId, userId);
    const urls = post.mediaUrls || [];
    await this.uploadService.deleteFileByUrl(urls);
    await this.postRepository.remove(post);
    return true;
  }
  async publishPost(postId: string, userId: string): Promise<Post> {
    const post = await this.getPost(postId, userId);
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
            platform as unknown as PlatformName,
          );

          if (credentials.length === 0) {
            throw new Error(`No credentials found for ${platform}`);
          }

          // Use first available credential
          const credential = credentials[0];
          const accessToken = await this.credentialsService.getAccessToken(
            credential.id,
            userId,
          );

          // 2️⃣ Let the gateway handle posting logic
          const result = await gateway.createNewPost(
            userId,
            post.content,
            accessToken,
            post.mediaUrls,
          );

          // 3️⃣ Notify gateway & persist
          await gateway.notifyPostPublished(post.id, platform, result);

          const publishedPost = this.publishedPostRepository.create({
            post,
            platform,
            publishedAt: new Date(),
            platformPostId: result.id,
            metadata: result,
          } as unknown as PublishedPost);

          publishResults.push(publishedPost);
        } catch (err: any) {
          // const detail = err.response!
          const message = err.message || 'Unknown error';
          errors.push({ platform, error: message });

          await gateway.notifyPostFailed(post.id, message);
        }
      }),
    );

    // 4️⃣ Update post status
    if (publishResults.length > 0) {
      post.status = PostStatus.PUBLISHED;
      await this.publishedPostRepository.save(publishResults);
    } else {
      post.status = PostStatus.FAILED;
      this.logger.error(
        `Publishing failed for all platforms: ${JSON.stringify(errors)}`,
      );
    }

    await this.postRepository.save(post);
    return this.getPost(postId, userId);
  }
}
