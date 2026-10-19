import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import {
  Between,
  DataSource,
  ILike,
  In,
  LessThanOrEqual,
  MoreThanOrEqual,
} from 'typeorm';
import { Post, PostStatus } from '../../entities/post.entity';
import { Insight, InsightType } from '../../entities/insight.entity';
import { MonitoredProfile } from '../../entities/monitored-profile.entity';
import { TweetMonitoredProfile } from '../../entities/tweet-monitored-profile.entity';

/** The rows the agent can read: one tenant, and only the listed workspaces. */
export interface DataScope {
  tenantId: string;
  workspaceIds: string[];
}

const MAX_ROWS = 50;

function take(limit?: number): number {
  return Math.min(Math.max(Math.floor(limit ?? 10), 1), MAX_ROWS);
}

function dateRange(from?: string, to?: string) {
  if (from && to) return Between(new Date(from), new Date(to));
  if (from) return MoreThanOrEqual(new Date(from));
  if (to) return LessThanOrEqual(new Date(to));
  return undefined;
}

/**
 * Read tools for the chat agent. Each tool adds the tenant and the workspaces of
 * the scope to its own query in code. The model gives only filters, never SQL,
 * so a prompt cannot reach the rows of another tenant or branch.
 */
export class DataQueryTools {
  static createTools(
    dataSource: DataSource,
    scope: DataScope,
  ): DynamicStructuredTool[] {
    const empty = scope.workspaceIds.length === 0;
    const inScope = () => ({
      tenantId: scope.tenantId,
      workspaceId: In([...scope.workspaceIds]),
    });
    const run = async (fn: () => Promise<unknown>) => {
      try {
        return JSON.stringify(await fn());
      } catch (error) {
        return JSON.stringify({ success: false, error: error.message });
      }
    };

    const postFilters = {
      status: z
        .nativeEnum(PostStatus)
        .optional()
        .describe('Only posts with this status'),
      search: z
        .string()
        .optional()
        .describe('Text that the post content contains'),
      from: z
        .string()
        .optional()
        .describe('ISO date: posts created on or after this date'),
      to: z
        .string()
        .optional()
        .describe('ISO date: posts created on or before this date'),
    };
    const postWhere = (f: {
      status?: PostStatus;
      search?: string;
      from?: string;
      to?: string;
    }) => ({
      ...inScope(),
      status: f.status,
      content: f.search ? ILike(`%${f.search}%`) : undefined,
      createdAt: dateRange(f.from, f.to),
    });

    return [
      new DynamicStructuredTool({
        name: 'query_posts',
        description:
          'List the posts of the current workspace, newest first. Optional filters: status, text, dates.',
        schema: z.object({
          ...postFilters,
          limit: z
            .number()
            .optional()
            .describe(`Number of posts (default 10, max ${MAX_ROWS})`),
        }),
        func: async (f) =>
          run(async () => {
            if (empty) return [];
            return dataSource.getRepository(Post).find({
              where: postWhere(f),
              order: { createdAt: 'DESC' },
              take: take(f.limit),
              select: [
                'id',
                'content',
                'status',
                'targetPlatforms',
                'scheduledFor',
                'createdAt',
                'failureReasons',
              ],
            });
          }),
      }),
      new DynamicStructuredTool({
        name: 'count_posts',
        description:
          'Count the posts of the current workspace. Optional filters: status, text, dates.',
        schema: z.object(postFilters),
        func: async (f) =>
          run(async () => ({
            count: empty
              ? 0
              : await dataSource
                  .getRepository(Post)
                  .count({ where: postWhere(f) }),
          })),
      }),
      new DynamicStructuredTool({
        name: 'query_insights',
        description:
          'List the AI insights of the current workspace, newest first.',
        schema: z.object({
          type: z
            .nativeEnum(InsightType)
            .optional()
            .describe('Only insights of this type'),
          search: z
            .string()
            .optional()
            .describe('Text that the insight title contains'),
          from: z
            .string()
            .optional()
            .describe('ISO date: insights created on or after this date'),
          to: z
            .string()
            .optional()
            .describe('ISO date: insights created on or before this date'),
          limit: z
            .number()
            .optional()
            .describe(`Number of insights (default 10, max ${MAX_ROWS})`),
        }),
        func: async (f) =>
          run(async () => {
            if (empty) return [];
            return dataSource.getRepository(Insight).find({
              where: {
                ...inScope(),
                type: f.type,
                title: f.search ? ILike(`%${f.search}%`) : undefined,
                createdAt: dateRange(f.from, f.to),
              },
              order: { createdAt: 'DESC' },
              take: take(f.limit),
              select: [
                'id',
                'type',
                'title',
                'description',
                'metadata',
                'relevanceScore',
                'isRead',
                'createdAt',
              ],
            });
          }),
      }),
      new DynamicStructuredTool({
        name: 'query_monitored_profiles',
        description:
          'List the X (Twitter) profiles that the current workspace monitors.',
        schema: z.object({
          isActive: z
            .boolean()
            .optional()
            .describe('Only active or only paused profiles'),
          limit: z
            .number()
            .optional()
            .describe(`Number of profiles (default 10, max ${MAX_ROWS})`),
        }),
        func: async (f) =>
          run(async () => {
            if (empty) return [];
            return dataSource.getRepository(MonitoredProfile).find({
              where: { ...inScope(), isActive: f.isActive },
              order: { createdAt: 'DESC' },
              take: take(f.limit),
              select: [
                'id',
                'xUsername',
                'displayName',
                'followerCount',
                'description',
                'isActive',
                'lastFetchedAt',
              ],
            });
          }),
      }),
      new DynamicStructuredTool({
        name: 'query_tweets',
        description:
          'List the tweets of the profiles that the current workspace monitors, newest first.',
        schema: z.object({
          username: z
            .string()
            .optional()
            .describe('Only tweets of this monitored X username'),
          search: z
            .string()
            .optional()
            .describe('Text that the tweet contains'),
          limit: z
            .number()
            .optional()
            .describe(`Number of tweets (default 10, max ${MAX_ROWS})`),
        }),
        func: async (f) =>
          run(async () => {
            if (empty) return [];
            const profiles = await dataSource
              .getRepository(MonitoredProfile)
              .find({
                where: { ...inScope(), xUsername: f.username },
                select: ['id', 'xUsername'],
              });
            if (profiles.length === 0) return [];
            const usernames = new Map(profiles.map((p) => [p.id, p.xUsername]));
            const links = await dataSource
              .getRepository(TweetMonitoredProfile)
              .find({
                where: {
                  monitoredProfileId: In(profiles.map((p) => p.id)),
                  tweet: f.search
                    ? { content: ILike(`%${f.search}%`) }
                    : undefined,
                },
                relations: { tweet: true },
                order: { linkedAt: 'DESC' },
                take: take(f.limit),
              });
            return links.map(({ tweet, monitoredProfileId }) => ({
              id: tweet.id,
              username: usernames.get(monitoredProfileId),
              content: tweet.content,
              createdAt: tweet.createdAt,
              likes: tweet.likes,
              retweets: tweet.retweets,
              replies: tweet.replies,
              views: tweet.views,
              hashtags: tweet.hashtags,
            }));
          }),
      }),
    ];
  }
}
