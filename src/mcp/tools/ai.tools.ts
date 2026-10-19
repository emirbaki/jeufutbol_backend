import { Injectable } from '@nestjs/common';
import { z } from 'zod/v4';
import { AIInsightsService, PostTemplateDto } from '../../insights/ai-insights.service';
import { McpToolDef, McpToolGroup } from '../mcp-tool';
import { McpAuthContext } from '../mcp-auth.context';
import { platformSchema, workspaceRefSchema } from '../schemas/post.schemas';
import { WorkspacesService } from '../../workspaces/workspaces.service';

const llmProviderSchema = z.enum(['openai', 'gemini', 'ollama', 'claude']);
const generatePostTextSchema = z.object({
  insights: z.array(z.string().min(1)).min(1).max(20),
  platform: platformSchema,
  tone: z.enum(['professional', 'casual', 'humorous', 'informative', 'engaging']).optional(),
  llmProvider: llmProviderSchema.optional(),
  credentialId: z.number().int().optional(),
});
const generateInsightsSchema = z.object({
  topic: z.string().min(1).max(200).optional(),
  llmProvider: llmProviderSchema.optional(),
  credentialId: z.number().int().optional(),
  workspace: workspaceRefSchema.optional(),
});
const getInsightsSchema = z.object({
  limit: z.number().int().min(1).max(50).default(10),
  workspace: workspaceRefSchema.optional(),
});
const analyzeTrendsSchema = z.object({
  topic: z.string().min(1).max(200).optional(),
  timeRange: z.enum(['24h', '7d', '30d']).default('7d'),
  workspace: workspaceRefSchema.optional(),
});
const JOB_NEXT = 'Call get_job with this jobId until status is completed.';

type GeneratePostTextArgs = z.infer<typeof generatePostTextSchema>;
type GenerateInsightsArgs = z.infer<typeof generateInsightsSchema>;
type GetInsightsArgs = z.input<typeof getInsightsSchema>;
type AnalyzeTrendsArgs = z.input<typeof analyzeTrendsSchema>;

@Injectable()
export class AiToolsGroup implements McpToolGroup {
  constructor(
    private readonly aiInsightsService: AIInsightsService,
    private readonly workspacesService: WorkspacesService,
  ) {}

  tools(): McpToolDef[] {
    return [
      {
        name: 'generate_post_text',
        title: 'Generate post text',
        description:
          'Write a caption for a platform from short insight lines. Runs in the background and returns a jobId for get_job.',
        scopes: ['insights:generate'],
        inputSchema: generatePostTextSchema,
        handler: (args: GeneratePostTextArgs, ctx: McpAuthContext) => this.generatePostText(args, ctx),
      },
      {
        name: 'generate_insights',
        title: 'Generate insights',
        description:
          'Make content insights for a topic from the monitored profiles. Runs in the background and returns a jobId for get_job.',
        scopes: ['insights:generate'],
        inputSchema: generateInsightsSchema,
        handler: (args: GenerateInsightsArgs, ctx: McpAuthContext) => this.generateInsights(args, ctx),
      },
      {
        name: 'get_insights',
        title: 'Get insights',
        description: 'Get the saved insights for this account.',
        scopes: ['insights:read'],
        inputSchema: getInsightsSchema,
        handler: async (args: GetInsightsArgs, ctx: McpAuthContext) => {
          const workspace = await this.workspacesService.resolve(ctx.tenantId, args.workspace);
          return this.aiInsightsService.getInsightsForUser(ctx.userId, ctx.tenantId, args.limit ?? 10, workspace.id);
        },
      },
      {
        name: 'analyze_trends',
        title: 'Analyze trends',
        description: 'Get the trending topics and posts for a time range.',
        scopes: ['insights:read'],
        inputSchema: analyzeTrendsSchema,
        handler: async (args: AnalyzeTrendsArgs, ctx: McpAuthContext) => {
          const workspace = await this.workspacesService.resolve(ctx.tenantId, args.workspace);
          return this.aiInsightsService.analyzeTrends({
            topic: args.topic,
            timeRange: args.timeRange ?? '7d',
            minEngagement: 100,
            tenantId: ctx.tenantId,
            workspaceId: workspace.id,
          });
        },
      },
    ];
  }

  private async generatePostText(args: GeneratePostTextArgs, ctx: McpAuthContext) {
    const { jobId } = await this.aiInsightsService.generatePostTemplate({
      insights: args.insights,
      // The service type lists older platform names. The service uses the value only as text.
      platform: args.platform as PostTemplateDto['platform'],
      tone: args.tone,
      includeHashtags: true,
      includeEmojis: true,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      llmProvider: args.llmProvider,
      credentialId: args.credentialId,
    });
    return { jobId, next: JOB_NEXT };
  }

  private async generateInsights(args: GenerateInsightsArgs, ctx: McpAuthContext) {
    const workspace = await this.workspacesService.resolve(ctx.tenantId, args.workspace);
    const { jobId } = await this.aiInsightsService.generateInsights({
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      workspaceId: workspace.id,
      topic: args.topic,
      llmProvider: args.llmProvider,
      credentialId: args.credentialId,
      useVectorSearch: !!args.topic,
    });
    return { jobId, next: JOB_NEXT };
  }
}
