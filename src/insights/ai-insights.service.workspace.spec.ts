jest.mock('uuid', () => ({ v4: () => require('crypto').randomUUID() }));
// The vector database and LLM code load ESM-only packages. These tests do not use them.
jest.mock('./vector-db.service', () => ({ VectorDbService: class {} }));
jest.mock('./llm.service', () => ({ LLMService: class {} }));

import { AIInsightsService } from './ai-insights.service';
import { AIInsightsSchedulerService } from './ai-insights-scheduler.service';

describe('AIInsightsService workspaces', () => {
  let profiles: { find: jest.Mock };
  let insights: { find: jest.Mock; save: jest.Mock };
  let svc: AIInsightsService;

  beforeEach(() => {
    profiles = { find: jest.fn().mockResolvedValue([]) };
    insights = { find: jest.fn().mockResolvedValue([]), save: jest.fn(async (x) => x) };
    svc = new AIInsightsService(
      {} as any,
      {} as any,
      profiles as any,
      insights as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  it('generateInsightsInternal reads profiles of the workspace', async () => {
    await svc.generateInsightsInternal({ userId: 'u1', tenantId: 't1', workspaceId: 'w2' });
    expect(profiles.find).toHaveBeenCalledWith({ where: { tenantId: 't1', workspaceId: 'w2', isActive: true } });
  });

  it('getInsightsForUser filters by workspace', async () => {
    await svc.getInsightsForUser('u1', 't1', 20, 'w2');
    expect(insights.find).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 't1', workspaceId: 'w2' } }));
  });
});

describe('AIInsightsSchedulerService', () => {
  it('enqueues one job for each workspace', async () => {
    const generateInsights = jest.fn().mockResolvedValue({ jobId: 'j' });
    const profileRepo = {
      find: jest.fn().mockResolvedValue([
        { tenantId: 't1', workspaceId: 'w1', userId: 'u1' },
        { tenantId: 't1', workspaceId: 'w1', userId: 'u2' },
        { tenantId: 't1', workspaceId: 'w2', userId: 'u3' },
      ]),
    };
    const scheduler = new AIInsightsSchedulerService({ generateInsights } as any, profileRepo as any);
    await scheduler.handleDailyInsights();
    expect(profileRepo.find).toHaveBeenCalledWith({ where: { isActive: true }, order: { createdAt: 'ASC' } });
    expect(generateInsights).toHaveBeenCalledTimes(2);
    expect(generateInsights).toHaveBeenCalledWith({ userId: 'u1', tenantId: 't1', workspaceId: 'w1', useVectorSearch: false });
    expect(generateInsights).toHaveBeenCalledWith({ userId: 'u3', tenantId: 't1', workspaceId: 'w2', useVectorSearch: false });
  });
});
