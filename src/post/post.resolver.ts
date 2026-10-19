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
import { TikTokCreatorInfo } from 'src/graphql/types/tiktok.type';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { WorkspaceAccessService } from '../workspaces/workspace-access.service';
import { canReachFromContext } from '../workspaces/subscription-access';
import { ActiveWorkspace } from '../workspaces/active-workspace.decorator';
import { Workspace } from '../entities/workspace.entity';
import { PostListFilter } from 'src/graphql/inputs/post-list.input';
import { PostPage, PostStatusCounts } from 'src/graphql/types/post-page.type';

@Resolver()
@UseGuards(CombinedAuthGuard, ApiKeyScopeGuard)
export class PostsResolver {
  constructor(
    private postsService: PostsService,
    @Inject('PUB_SUB') private readonly pubSub: PubSub,
    private workspacesService: WorkspacesService,
    private accessService: WorkspaceAccessService,
  ) { }


  @Mutation(() => Post)
  @RequireScopes(ApiKeyScope.POSTS_WRITE)
  async createPost(
    @CurrentUser() user: User,
    @CurrentApiKey() apiKey: ApiKey,
    @Args('input', { type: () => CreatePostInput }) input: CreatePostInput,
    @ActiveWorkspace() workspace: Workspace,
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
      workspaceId: input.workspaceId
        ? (await this.workspacesService.resolve(tenantId, input.workspaceId, await this.accessService.accessFor(user, apiKey))).id
        : workspace.id,
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
    @Args('offset', { type: () => Int, nullable: true }) offset?: number,
    @Args('workspaceId', { type: () => String, nullable: true }) workspaceRef?: string,
    @ActiveWorkspace() workspace?: Workspace,
  ): Promise<Post[]> {
    const tenantId = user?.tenantId || apiKey?.tenantId;
    const userId = user?.id || apiKey?.createdByUserId;

    if (!userId) {
      throw new Error('User context required');
    }

    const workspaceId = workspaceRef
      ? (await this.workspacesService.resolve(tenantId, workspaceRef, await this.accessService.accessFor(user, apiKey))).id
      : workspace?.id;
    return this.postsService.getUserPosts(userId, tenantId, limit, offset, undefined, workspaceId);
  }

  @Query(() => PostPage)
  @RequireScopes(ApiKeyScope.POSTS_READ)
  async postList(
    @CurrentUser() user: User,
    @CurrentApiKey() apiKey: ApiKey,
    @Args('filter', { type: () => PostListFilter, nullable: true }) filter: PostListFilter = {},
    @ActiveWorkspace() workspace: Workspace,
  ): Promise<PostPage> {
    const tenantId = user?.tenantId || apiKey?.tenantId;
    return this.postsService.listPosts(tenantId, workspace.id, filter ?? {});
  }

  @Query(() => PostStatusCounts)
  @RequireScopes(ApiKeyScope.POSTS_READ)
  async postStatusCounts(
    @CurrentUser() user: User,
    @CurrentApiKey() apiKey: ApiKey,
    @Args('filter', { type: () => PostListFilter, nullable: true }) filter: PostListFilter = {},
    @ActiveWorkspace() workspace: Workspace,
  ): Promise<PostStatusCounts> {
    const tenantId = user?.tenantId || apiKey?.tenantId;
    return this.postsService.countPostsByStatus(tenantId, workspace.id, filter ?? {});
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
    return this.loadPost(postId, user, apiKey);
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
    await this.loadPost(postId, user, apiKey);
    const workspaceId = input.workspaceId
      ? (await this.workspacesService.resolve(tenantId, input.workspaceId, await this.accessService.accessFor(user, apiKey))).id
      : undefined;
    return this.postsService.updatePost(postId, userId, tenantId, {
      ...input,
      workspaceId,
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
    await this.loadPost(postId, user, apiKey);
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
    await this.loadPost(postId, user, apiKey);
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
    await this.loadPost(postId, user, apiKey);
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

  // Each connection gets only the posts of its tenant and its branches.
  @Subscription(() => Post, {
    filter: (payload: { postUpdated: Post }, _variables: unknown, context: any) =>
      canReachFromContext(context, payload.postUpdated),
  })
  postUpdated() {
    return this.pubSub.asyncIterableIterator('postUpdated');
  }

  /**
   * Get TikTok creator info for posting compliance
   * Returns privacy options, posting limits, and interaction settings
   * Required by TikTok Content Sharing Guidelines
   */
  @Query(() => TikTokCreatorInfo)
  @RequireScopes(ApiKeyScope.POSTS_READ)
  async getTikTokCreatorInfo(
    @CurrentUser() user: User,
    @CurrentApiKey() apiKey: ApiKey,
    @Args('workspaceId', { type: () => String, nullable: true }) workspaceRef?: string,
    @ActiveWorkspace() workspace?: Workspace,
  ): Promise<TikTokCreatorInfo> {
    const tenantId = user?.tenantId || apiKey?.tenantId;
    const userId = user?.id || apiKey?.createdByUserId;

    if (!userId) {
      throw new Error('User context required');
    }

    const tiktokWorkspace = workspaceRef
      ? (await this.workspacesService.resolve(tenantId, workspaceRef, await this.accessService.accessFor(user, apiKey))).id
      : workspace?.id;
    return this.postsService.getTikTokCreatorInfo(userId, tenantId, tiktokWorkspace);
  }

  /** Loads a post of the tenant and checks that the caller reaches its branch. */
  private async loadPost(postId: string, user: User, apiKey: ApiKey): Promise<Post> {
    const tenantId = user?.tenantId || apiKey?.tenantId;
    const userId = user?.id || apiKey?.createdByUserId;
    const post = await this.postsService.getPost(postId, userId, tenantId);
    this.accessService.assertRow(await this.accessService.accessFor(user, apiKey), post.workspaceId, 'Post');
    return post;
  }
}
