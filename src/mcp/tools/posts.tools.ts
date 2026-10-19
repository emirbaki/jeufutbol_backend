import { Injectable } from '@nestjs/common';
import { z } from 'zod/v4';
import { CredentialsService } from '../../credentials/credential.service';
import { PlatformName } from '../../entities/credential.entity';
import { Post, PostStatus } from '../../entities/post.entity';
import { CreatePostInput } from '../../graphql/inputs/post.input';
import { PostsService, PublishMode } from '../../post/post.service';
import { McpToolDef, McpToolError, McpToolGroup } from '../mcp-tool';
import { McpAuthContext } from '../mcp-auth.context';
import { createPostSchema, summarizePost, updatePostSchema } from '../schemas/post.schemas';

type CreatePostArgs = z.infer<typeof createPostSchema>;
type UpdatePostArgs = z.infer<typeof updatePostSchema>;

const postIdSchema = z.object({ postId: z.string().uuid() });
const listPostsSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
  status: z.enum(PostStatus).optional(),
});
const PUBLISH_NEXT = 'Call get_post until status is published or failed.';

function saveNext(post: Post): string {
  return post.scheduledFor
    ? 'The post is scheduled. Call get_post to check it later.'
    : 'Call publish_post with this postId.';
}

@Injectable()
export class PostToolsGroup implements McpToolGroup {
  constructor(
    private readonly postsService: PostsService,
    private readonly credentialsService: CredentialsService,
  ) {}

  tools(): McpToolDef[] {
    return [
      {
        name: 'create_post',
        title: 'Create post',
        description:
          'Create a post. Order of steps: list_connected_accounts, create_upload or import_media_from_url, create_post, publish_post, get_post. Set scheduledFor to schedule the post instead.',
        scopes: ['posts:write'],
        inputSchema: createPostSchema,
        handler: (args: CreatePostArgs, ctx: McpAuthContext) => this.createPost(args, ctx),
      },
      {
        name: 'update_post',
        title: 'Update post',
        description: 'Change a post that is not published. Give the postId and only the fields to change.',
        scopes: ['posts:write'],
        inputSchema: updatePostSchema,
        handler: (args: UpdatePostArgs, ctx: McpAuthContext) => this.updatePost(args, ctx),
      },
      {
        name: 'publish_post',
        title: 'Publish post',
        description:
          'Publish a post now, in the background. Then call get_post to see the result for each platform.',
        scopes: ['posts:write'],
        inputSchema: postIdSchema,
        handler: (args: { postId: string }, ctx: McpAuthContext) => this.enqueue(args.postId, 'publish', ctx),
      },
      {
        name: 'retry_publish_post',
        title: 'Retry publish',
        description:
          'Publish again to the platforms that failed. The platforms that succeeded do not get a second post.',
        scopes: ['posts:write'],
        inputSchema: postIdSchema,
        handler: (args: { postId: string }, ctx: McpAuthContext) => this.enqueue(args.postId, 'retry', ctx),
      },
      {
        name: 'get_post',
        title: 'Get post',
        description: 'Get the status of a post, the URL on each platform, and the failure reasons.',
        scopes: ['posts:read'],
        inputSchema: postIdSchema,
        handler: (args: { postId: string }, ctx: McpAuthContext) => this.getPost(args.postId, ctx),
      },
      {
        name: 'list_posts',
        title: 'List posts',
        description: 'List the posts of the account, newest first. Filter by status if necessary.',
        scopes: ['posts:read'],
        inputSchema: listPostsSchema,
        handler: (args: z.infer<typeof listPostsSchema>, ctx: McpAuthContext) => this.listPosts(args, ctx),
      },
      {
        name: 'delete_post',
        title: 'Delete post',
        description: 'Delete a post and its media from JeuHub. This does not remove it from the platforms.',
        scopes: ['posts:delete'],
        inputSchema: postIdSchema,
        handler: (args: { postId: string }, ctx: McpAuthContext) => this.deletePost(args.postId, ctx),
      },
    ];
  }

  private async checkAccounts(platforms: string[], ctx: McpAuthContext): Promise<void> {
    for (const platform of platforms) {
      const found = await this.credentialsService.listCredentials(ctx.tenantId, {
        platform: platform as PlatformName,
      });
      if (!found.length) {
        throw new McpToolError(
          `No ${platform} account is connected. Connect it in JeuHub Settings, then call list_connected_accounts.`,
        );
      }
    }
  }

  private async createPost(args: CreatePostArgs, ctx: McpAuthContext) {
    await this.checkAccounts(args.targetPlatforms, ctx);
    const input = {
      ...args,
      mediaUrls: args.mediaUrls ?? [],
      scheduledFor: args.scheduledFor ? new Date(args.scheduledFor) : null,
    } as CreatePostInput;
    const post = await this.postsService.createPost(ctx.userId, ctx.tenantId, input);
    return { postId: post.id, status: post.status, next: saveNext(post) };
  }

  private async updatePost(args: UpdatePostArgs, ctx: McpAuthContext) {
    const { postId, scheduledFor, ...fields } = args;
    if (fields.targetPlatforms) await this.checkAccounts(fields.targetPlatforms, ctx);
    const updates: Partial<CreatePostInput> = { ...(fields as Partial<CreatePostInput>) };
    if (scheduledFor !== undefined) updates.scheduledFor = new Date(scheduledFor);
    const post = await this.postsService.updatePost(postId, ctx.userId, ctx.tenantId, updates);
    return { postId: post.id, status: post.status, next: saveNext(post) };
  }

  private async enqueue(postId: string, mode: PublishMode, ctx: McpAuthContext) {
    const out = await this.postsService.enqueuePublish(postId, ctx.userId, ctx.tenantId, mode);
    return { ...out, next: PUBLISH_NEXT };
  }

  private async getPost(postId: string, ctx: McpAuthContext) {
    const post = await this.postsService.getPost(postId, ctx.userId, ctx.tenantId);
    const jobState = await this.postsService.getPublishJobState(post.id);
    return summarizePost(post, jobState);
  }

  private async listPosts(args: z.infer<typeof listPostsSchema>, ctx: McpAuthContext) {
    const posts = await this.postsService.getUserPosts(ctx.userId, ctx.tenantId, args.limit, args.offset, args.status);
    return {
      posts: posts.map((p) => ({
        postId: p.id,
        status: p.status,
        content: p.content,
        targetPlatforms: p.targetPlatforms,
        scheduledFor: p.scheduledFor ? new Date(p.scheduledFor).toISOString() : null,
      })),
    };
  }

  private async deletePost(postId: string, ctx: McpAuthContext) {
    const deleted = await this.postsService.deletePost(postId, ctx.userId, ctx.tenantId);
    return { deleted };
  }
}
