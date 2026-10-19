import { z } from 'zod/v4';
import { Post } from '../../entities/post.entity';
import type { PublishJobState } from '../../post/post.service';

export const platformSchema = z.enum(['instagram', 'facebook', 'x', 'tiktok', 'youtube']);

export const workspaceRefSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .describe('Workspace slug or ID from list_workspaces. Leave it out to use the default workspace.');

const youtubeSettingsSchema = z.object({
  title: z.string().min(1).max(100),
  privacy_status: z.enum(['public', 'private', 'unlisted']).default('public'),
  category_id: z.string().optional(),
  tags: z.array(z.string()).optional(),
  is_short: z.boolean().optional(),
  made_for_kids: z.boolean().optional(),
  notify_subscribers: z.boolean().optional(),
});

const tiktokSettingsSchema = z.object({
  title: z.string().optional(),
  privacy_level: z.enum(['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'SELF_ONLY', 'FOLLOWER_OF_CREATOR']),
  allow_comment: z.boolean(),
  allow_duet: z.boolean(),
  allow_stitch: z.boolean(),
  is_brand_organic: z.boolean().optional(),
  is_branded_content: z.boolean().optional(),
  auto_add_music: z.boolean().optional(),
});

const instagramSettingsSchema = z.object({
  isTrialReel: z.boolean().optional(),
  graduationStrategy: z.enum(['MANUAL', 'SS_PERFORMANCE']).optional(),
});

const postFields = {
  content: z.string().min(1).max(5000),
  targetPlatforms: z
    .array(platformSchema)
    .min(1)
    .max(5)
    .refine((list) => new Set(list).size === list.length, 'targetPlatforms must not have duplicates.'),
  mediaUrls: z.array(z.url({ protocol: /^https$/ })).max(10).optional(),
  scheduledFor: z.iso.datetime({ offset: true }).optional(),
  youtubeSettings: youtubeSettingsSchema.optional(),
  tiktokSettings: tiktokSettingsSchema.optional(),
  instagramSettings: instagramSettingsSchema.optional(),
  platformSpecificContent: z.record(z.string(), z.any()).optional(),
  workspace: workspaceRefSchema.optional(),
};

interface PostRuleInput {
  targetPlatforms?: string[];
  mediaUrls?: string[];
  scheduledFor?: string;
  youtubeSettings?: unknown;
  tiktokSettings?: unknown;
}

/** Checks the cross-field rules. With `partial`, the media rule runs only when the call has mediaUrls. */
function checkPostRules(value: PostRuleInput, ctx: z.RefinementCtx, partial: boolean): void {
  const platforms = value.targetPlatforms ?? [];
  const hasYoutube = platforms.includes('youtube');
  const hasTiktok = platforms.includes('tiktok');

  if (hasYoutube && !value.youtubeSettings) {
    ctx.addIssue({
      code: 'custom',
      path: ['youtubeSettings', 'title'],
      message: 'youtubeSettings.title is required when targetPlatforms has youtube.',
    });
  }
  if (hasTiktok && !value.tiktokSettings) {
    ctx.addIssue({
      code: 'custom',
      path: ['tiktokSettings', 'privacy_level'],
      message:
        'tiktokSettings.privacy_level is required when targetPlatforms has tiktok. Call get_tiktok_creator_info for the allowed values.',
    });
  }
  const checkMedia = !partial || value.mediaUrls !== undefined;
  if ((hasYoutube || hasTiktok) && checkMedia && !value.mediaUrls?.length) {
    ctx.addIssue({
      code: 'custom',
      path: ['mediaUrls'],
      message: 'A video is required for youtube and tiktok. Call create_upload or import_media_from_url first.',
    });
  }
  if (value.scheduledFor !== undefined && Date.parse(value.scheduledFor) <= Date.now()) {
    ctx.addIssue({ code: 'custom', path: ['scheduledFor'], message: 'scheduledFor must be in the future.' });
  }
}

export const createPostSchema = z.object(postFields).superRefine((v, ctx) => checkPostRules(v, ctx, false));

export const updatePostSchema = z
  .object({
    postId: z.string().uuid(),
    ...postFields,
    content: postFields.content.optional(),
    targetPlatforms: postFields.targetPlatforms.optional(),
  })
  .superRefine((v, ctx) => checkPostRules(v, ctx, true));

export interface PostSummary {
  postId: string;
  status: string;
  content: string;
  targetPlatforms: string[];
  mediaUrls: string[];
  scheduledFor: string | null;
  failureReasons: Record<string, string> | null;
  publishedPosts: { platform: string; url: string | null; status: string | null }[];
  jobState: PublishJobState;
  workspace: string | null;
  next: string;
}

function summaryNext(status: string, jobState: PublishJobState): string {
  if (jobState !== 'none') return 'The publish is in progress. Call get_post again in 30 seconds.';
  switch (status) {
    case 'published':
      return 'Done.';
    case 'failed':
      return 'Some platforms failed. Fix the cause in failureReasons, then call retry_publish_post.';
    case 'scheduled':
      return 'The post will publish at scheduledFor.';
    default:
      return 'Call publish_post to publish it.';
  }
}

export function summarizePost(post: Post, jobState: PublishJobState): PostSummary {
  return {
    postId: post.id,
    status: post.status,
    content: post.content,
    targetPlatforms: post.targetPlatforms ?? [],
    mediaUrls: post.mediaUrls ?? [],
    scheduledFor: post.scheduledFor ? new Date(post.scheduledFor).toISOString() : null,
    failureReasons: post.failureReasons ?? null,
    publishedPosts: (post.publishedPosts ?? []).map((p) => ({
      platform: p.platform,
      url: p.platformPostUrl ?? null,
      status: p.publishStatus ?? null,
    })),
    jobState,
    workspace: post.workspace?.slug ?? null,
    next: summaryNext(post.status, jobState),
  };
}
