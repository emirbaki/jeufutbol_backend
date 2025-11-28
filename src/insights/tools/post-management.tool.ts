import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { PostsService } from '../../post/post.service';
import { PlatformType } from '../../enums/platform-type.enum';

export class CreatePostTool {
    static createTool(postsService: PostsService, userId: string, tenantId: string) {
        return new DynamicStructuredTool({
            name: 'create_post',
            description: 'Create a new social media post draft. Does NOT publish it.',
            schema: z.object({
                content: z.string().describe('The content of the post'),
                platforms: z
                    .array(z.enum(['twitter', 'instagram', 'facebook', 'linkedin']))
                    .describe('Target platforms for the post'),
                scheduledFor: z
                    .string()
                    .optional()
                    .describe('ISO date string for scheduling the post (optional)'),
            }),
            func: async ({ content, platforms, scheduledFor }) => {
                try {
                    const post = await postsService.createPost(userId, tenantId, {
                        content,
                        targetPlatforms: platforms as PlatformType[],
                        scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
                        mediaUrls: [],
                        platformSpecificContent: {},
                    });
                    return JSON.stringify({
                        success: true,
                        message: 'Post draft created successfully',
                        postId: post.id,
                        status: post.status,
                    });
                } catch (error) {
                    return JSON.stringify({
                        success: false,
                        error: error.message,
                    });
                }
            },
        });
    }
}

export class ListPostsTool {
    static createTool(postsService: PostsService, userId: string, tenantId: string) {
        return new DynamicStructuredTool({
            name: 'list_posts',
            description: 'List recent social media posts',
            schema: z.object({
                limit: z.number().optional().describe('Number of posts to return (default: 10)'),
            }),
            func: async ({ limit }) => {
                try {
                    const posts = await postsService.getUserPosts(userId, tenantId, limit || 10);
                    return JSON.stringify(
                        posts.map((p) => ({
                            id: p.id,
                            content: p.content,
                            status: p.status,
                            platforms: p.targetPlatforms,
                            createdAt: p.createdAt,
                        })),
                    );
                } catch (error) {
                    return JSON.stringify({
                        success: false,
                        error: error.message,
                    });
                }
            },
        });
    }
}

export class PublishPostTool {
    static createTool(postsService: PostsService, userId: string, tenantId: string) {
        return new DynamicStructuredTool({
            name: 'publish_post',
            description: 'Publish a specific post by ID',
            schema: z.object({
                postId: z.string().describe('The ID of the post to publish'),
            }),
            func: async ({ postId }) => {
                try {
                    const post = await postsService.publishPost(postId, userId, tenantId);
                    return JSON.stringify({
                        success: true,
                        message: 'Post published successfully',
                        postId: post.id,
                        status: post.status,
                        publishedPosts: post.publishedPosts,
                    });
                } catch (error) {
                    return JSON.stringify({
                        success: false,
                        error: error.message,
                    });
                }
            },
        });
    }
}
