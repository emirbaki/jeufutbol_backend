// The real AIInsightsService loads ESM-only packages (uuid, @xenova/transformers) that Jest cannot parse.
jest.mock('../../insights/ai-insights.service', () => ({ AIInsightsService: class {} }));

import { AiToolsGroup } from './ai.tools';
import { McpAuthContext } from '../mcp-auth.context';

const ctx: McpAuthContext = {
  userId: 'u1',
  tenantId: 't1',
  grant: { isUser: false, scopes: [] },
  keyPrefix: 'jeu_ab',
  apiBaseUrl: 'https://x/api',
};

describe('AiToolsGroup', () => {
  let ai: Record<string, jest.Mock>;
  let group: AiToolsGroup;
  const tool = (name: string) => group.tools().find((t) => t.name === name)!;

  beforeEach(() => {
    ai = {
      generatePostTemplate: jest.fn(),
      generateInsights: jest.fn(),
      getInsightsForUser: jest.fn(),
      analyzeTrends: jest.fn(),
    };
    group = new AiToolsGroup(ai as any);
  });

  it('generate_post_text passes the tenant and the defaults', async () => {
    ai.generatePostTemplate.mockResolvedValue({ jobId: '7' });
    const out: any = await tool('generate_post_text').handler({ insights: ['a'], platform: 'tiktok' }, ctx);
    expect(ai.generatePostTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        insights: ['a'],
        platform: 'tiktok',
        includeHashtags: true,
        includeEmojis: true,
        userId: 'u1',
        tenantId: 't1',
      }),
    );
    expect(out).toEqual({ jobId: '7', next: 'Call get_job with this jobId until status is completed.' });
  });

  it('generate_insights sets useVectorSearch from the topic', async () => {
    ai.generateInsights.mockResolvedValue({ jobId: '8' });
    await tool('generate_insights').handler({ topic: 'Galatasaray' }, ctx);
    expect(ai.generateInsights).toHaveBeenCalledWith(
      expect.objectContaining({ topic: 'Galatasaray', useVectorSearch: true, tenantId: 't1' }),
    );
  });

  it('analyze_trends uses 7d by default', async () => {
    await tool('analyze_trends').handler({}, ctx);
    expect(ai.analyzeTrends).toHaveBeenCalledWith({
      topic: undefined,
      timeRange: '7d',
      minEngagement: 100,
      tenantId: 't1',
    });
  });

  it('rejects an unknown tone and provider', () => {
    const s = tool('generate_post_text').inputSchema;
    expect(s.safeParse({ insights: ['a'], platform: 'x', tone: 'angry' }).success).toBe(false);
    expect(s.safeParse({ insights: ['a'], platform: 'x', llmProvider: 'gpt' }).success).toBe(false);
  });

  it('has the correct scopes', () => {
    expect(tool('generate_post_text').scopes).toEqual(['insights:generate']);
    expect(tool('get_insights').scopes).toEqual(['insights:read']);
  });
});
