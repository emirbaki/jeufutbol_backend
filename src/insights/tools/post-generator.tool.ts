import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

export class PostGeneratorTool {
  static createTool(insightsService: any) {
    return new DynamicStructuredTool({
      name: 'generate_post_template',
      description:
        'Generate a social media post template based on insights and current trends',
      schema: z.object({
        insights: z
          .array(z.string())
          .describe('Array of insights to base the post on'),
        platform: z
          .enum(['twitter', 'instagram', 'facebook', 'linkedin'])
          .describe('Target social media platform'),
        tone: z
          .enum([
            'professional',
            'casual',
            'humorous',
            'informative',
            'engaging',
          ])
          .optional()
          .describe('Tone of the post'),
        includeHashtags: z
          .boolean()
          .optional()
          .describe('Whether to include hashtags'),
        includeEmojis: z
          .boolean()
          .optional()
          .describe('Whether to include emojis'),
      }),
      func: async ({
        insights,
        platform,
        tone,
        includeHashtags,
        includeEmojis,
      }) => {
        try {
          const post = await insightsService.generatePostTemplate({
            insights,
            platform,
            tone: tone || 'engaging',
            includeHashtags: includeHashtags !== false,
            includeEmojis: includeEmojis !== false,
          });
          return JSON.stringify(post);
        } catch (error) {
          return `Error generating post: ${error.message}`;
        }
      },
    });
  }
}

export class TrendAnalysisTool {
  static createTool(insightsService: any) {
    return new DynamicStructuredTool({
      name: 'analyze_trends',
      description: 'Analyze current trends from monitored profiles',
      schema: z.object({
        topic: z.string().optional().describe('Specific topic to analyze'),
        timeRange: z
          .enum(['24h', '7d', '30d'])
          .optional()
          .describe('Time range for analysis'),
        minEngagement: z
          .number()
          .optional()
          .describe('Minimum engagement threshold'),
      }),
      func: async ({ topic, timeRange, minEngagement }) => {
        try {
          const trends = await insightsService.analyzeTrends({
            topic,
            timeRange: timeRange || '7d',
            minEngagement: minEngagement || 100,
          });
          return JSON.stringify(trends);
        } catch (error) {
          return `Error analyzing trends: ${error.message}`;
        }
      },
    });
  }
}

export class ContentSuggestionTool {
  static createTool(insightsService: any) {
    return new DynamicStructuredTool({
      name: 'suggest_content',
      description:
        'Get content suggestions based on trending topics and user preferences',
      schema: z.object({
        category: z
          .string()
          .optional()
          .describe('Content category (e.g., tech, business, lifestyle)'),
        count: z
          .number()
          .optional()
          .describe('Number of suggestions to generate'),
      }),
      func: async ({ category, count }) => {
        try {
          const suggestions = await insightsService.generateContentSuggestions({
            category,
            count: count || 5,
          });
          return JSON.stringify(suggestions);
        } catch (error) {
          return `Error generating suggestions: ${error.message}`;
        }
      },
    });
  }
}
