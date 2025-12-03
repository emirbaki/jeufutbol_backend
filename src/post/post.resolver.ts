import { Resolver, Query, Mutation, Args, Int, Subscription } from '@nestjs/graphql';
import { Inject, UseGuards } from '@nestjs/common';
import { PubSub } from 'graphql-subscriptions';
import { PostsService } from './post.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { Post } from '../entities/post.entity';
import { UpdatePostInput } from 'src/graphql/inputs/update-post.input';
import { CreatePostInput } from 'src/graphql/inputs/post.input';
import { CombinedAuthGuard } from '../auth/guards/combined-auth.guard';
import { ApiKeyScopeGuard } from '../auth/guards/api-key-scope.guard';
import { RequireScopes } from '../auth/decorators/require-scopes.decorator';
import { ApiKeyScope } from '../auth/api-key-scopes.enum';
import { CurrentApiKey } from '../auth/decorators/current-api-key.decorator';
import { ApiKey } from '../entities/api-key.entity';

@Resolver()
@UseGuards(CombinedAuthGuard, ApiKeyScopeGuard)
export class PostsResolver {
  constructor(
    private postsService: PostsService,
    @Inject('PUB_SUB') private readonly pubSub: PubSub,
  ) { }

  @Mutation(() => Post)
  @RequireScopes(ApiKeyScope.POSTS_WRITE)
  async createPost(
    @CurrentUser() user: User,
    @CurrentApiKey() apiKey: ApiKey,
    @Args('input', { type: () => CreatePostInput }) input: CreatePostInput,
  ): Promise<Post> {
    const tenantId = user?.tenantId || apiKey?.tenantId;
    const userId = user?.id || apiKey?.createdByUserId;

    if (!userId) {
      throw new Error('User ID is required to create a post');
    }

    const _scheduledFor = input.scheduledFor
      ? new Date(input.scheduledFor)
      : null;
    return this.postsService.createPost(userId, tenantId, {
      ...input,
      platformSpecificContent: input.platformSpecificContent,
      scheduledFor: _scheduledFor,
    });
  }

  @Query(() => [Post])
  @RequireScopes(ApiKeyScope.POSTS_READ)
  async getUserPosts(
    @CurrentUser() user: User,
    @CurrentApiKey() apiKey: ApiKey,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
  ): Promise<Post[]> {
    const tenantId = user?.tenantId || apiKey?.tenantId;
    const userId = user?.id || apiKey?.createdByUserId;

    if (!userId) {
      throw new Error('User context required');
    }

    return this.postsService.getUserPosts(userId, tenantId, limit);
  }

  @Query(() => Post)
  @RequireScopes(ApiKeyScope.POSTS_READ)
  async getPost(
    @CurrentUser() user: User,
    @CurrentApiKey() apiKey: ApiKey,
    @Args('postId') postId: string,
  ): Promise<Post> {
    const tenantId = user?.tenantId || apiKey?.tenantId;
    const userId = user?.id || apiKey?.createdByUserId;
    return this.postsService.getPost(postId, userId, tenantId);
  }

  @Mutation(() => Post)
  @RequireScopes(ApiKeyScope.POSTS_WRITE)
  async updatePost(
    @CurrentUser() user: User,
    @CurrentApiKey() apiKey: ApiKey,
    @Args('postId') postId: string,
    @Args('input', { type: () => UpdatePostInput }) input: UpdatePostInput,
  ): Promise<Post> {
    const tenantId = user?.tenantId || apiKey?.tenantId;
    const userId = user?.id || apiKey?.createdByUserId;
    return this.postsService.updatePost(postId, userId, tenantId, {
      ...input,
      platformSpecificContent: input.platformSpecificContent,
      scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : input.scheduledFor,
    });
  }

  @Mutation(() => Boolean)
  @RequireScopes(ApiKeyScope.POSTS_DELETE)
  async deletePost(
    @CurrentUser() user: User,
    @CurrentApiKey() apiKey: ApiKey,
    @Args('postId') postId: string,
  ): Promise<boolean> {
    const tenantId = user?.tenantId || apiKey?.tenantId;
    const userId = user?.id || apiKey?.createdByUserId;
    return this.postsService.deletePost(postId, userId, tenantId);
  }

  @Mutation(() => Post)
  @RequireScopes(ApiKeyScope.POSTS_WRITE)
  async publishPost(
    @CurrentUser() user: User,
    @CurrentApiKey() apiKey: ApiKey,
    @Args('postId') postId: string,
  ): Promise<Post> {
    const tenantId = user?.tenantId || apiKey?.tenantId;
    const userId = user?.id || apiKey?.createdByUserId;
    return this.postsService.publishPost(postId, userId, tenantId);
  }

  @Mutation(() => Post)
  @RequireScopes(ApiKeyScope.POSTS_WRITE)
  async retryPublishPost(
    @CurrentUser() user: User,
    @CurrentApiKey() apiKey: ApiKey,
    @Args('postId') postId: string,
  ): Promise<Post> {
    const tenantId = user?.tenantId || apiKey?.tenantId;
    const userId = user?.id || apiKey?.createdByUserId;
    return this.postsService.retryPublishPost(postId, userId, tenantId);
  }

  @Mutation(() => Boolean)
  @RequireScopes(ApiKeyScope.POSTS_WRITE)
  async testPublish(
    @CurrentUser() user: User,
    @CurrentApiKey() apiKey: ApiKey,
  ): Promise<boolean> {
    const tenantId = user?.tenantId || apiKey?.tenantId;
    const userId = user?.id || apiKey?.createdByUserId;

    console.log('Test publish triggered by user:', userId);
    const testPost: any = {
      id: 'test-123',
      content: 'Test post',
      status: 'DRAFT',
      tenantId: tenantId,
      userId: userId,
      targetPlatforms: [],
      createdAt: new Date(),
    };

    await this.pubSub.publish('postUpdated', { postUpdated: testPost });
    console.log('Published test event');
    return true;
  }

  @Subscription(() => Post)
  postUpdated() {
    return this.pubSub.asyncIterableIterator('postUpdated');
  }
}
