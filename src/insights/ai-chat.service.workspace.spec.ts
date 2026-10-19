jest.mock('uuid', () => ({ v4: () => require('crypto').randomUUID() }));
// The LLM, vector database and agent code load ESM-only packages. These tests stop before they run.
jest.mock('./llm.service', () => ({ LLMService: class {} }));
jest.mock('./ai-insights.service', () => ({ AIInsightsService: class {} }));
jest.mock('./vector-db.service', () => ({ VectorDbService: class {} }));

import { AiChatService } from './ai-chat.service';

describe('AiChatService workspaces', () => {
  let sessions: { create: jest.Mock; save: jest.Mock; find: jest.Mock; findOne: jest.Mock; update: jest.Mock };
  let messages: { save: jest.Mock; find: jest.Mock };
  let llm: { getModel: jest.Mock };
  let svc: AiChatService;

  beforeEach(() => {
    sessions = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 's-new', ...x })),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      update: jest.fn(),
    };
    messages = { save: jest.fn(), find: jest.fn().mockResolvedValue([]) };
    llm = { getModel: jest.fn().mockResolvedValue({}) };
    svc = new AiChatService(sessions as any, messages as any, llm as any, {} as any, {} as any, {} as any, {} as any);
  });

  it('createChatSession saves workspaceId', async () => {
    await svc.createChatSession('u1', 't1', 'Hi', 'w2');
    expect(sessions.create).toHaveBeenCalledWith({ userId: 'u1', tenantId: 't1', title: 'Hi', workspaceId: 'w2' });
  });

  it('getUserChatSessions filters by workspace', async () => {
    await svc.getUserChatSessions('u1', 't1', 'w2');
    expect(sessions.find).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'u1', tenantId: 't1', workspaceId: 'w2' } }));
  });

  it('a message to an old session uses the session workspace', async () => {
    sessions.findOne.mockResolvedValue({ id: 's1', userId: 'u1', workspaceId: 'w-session' });
    const build = jest.spyOn(svc, 'buildAgentTools').mockRejectedValue(new Error('stop'));
    await svc.chatWithAI('u1', 't1', 's1', 'hello', 'openai' as any, undefined, 'w-active').catch(() => undefined);
    expect(build).toHaveBeenCalledWith('u1', 't1', 'w-session');
  });

  it('a new session uses the given workspace', async () => {
    const build = jest.spyOn(svc, 'buildAgentTools').mockRejectedValue(new Error('stop'));
    await svc.chatWithAI('u1', 't1', null, 'hello', 'openai' as any, undefined, 'w-active').catch(() => undefined);
    expect(sessions.create).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'w-active' }));
    expect(build).toHaveBeenCalledWith('u1', 't1', 'w-active');
  });

  it('the agent has no free SQL tool, and its data tools read only the session workspace', async () => {
    const postRepo = { find: jest.fn().mockResolvedValue([]), count: jest.fn() };
    const dataSource = { getRepository: jest.fn(() => postRepo), query: jest.fn() };
    svc = new AiChatService(sessions as any, messages as any, llm as any, {} as any, {} as any, dataSource as any, {} as any);
    const tools = await svc.buildAgentTools('u1', 't1', 'w1');
    const names = tools.map((t) => t.name);
    expect(names.some((n) => n.includes('sql'))).toBe(false);
    await tools.find((t) => t.name === 'query_posts')!.invoke({ workspaceId: 'w2' } as any);
    expect(postRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: 't1', workspaceId: expect.objectContaining({ value: ['w1'] }) }) }),
    );
  });
});
