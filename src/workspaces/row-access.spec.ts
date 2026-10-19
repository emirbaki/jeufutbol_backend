jest.mock('uuid', () => ({ v4: () => require('crypto').randomUUID() }));
jest.mock('../insights/ai-insights.service', () => ({ AIInsightsService: class {} }));

import { NotFoundException } from '@nestjs/common';
import { canReachFromContext } from './subscription-access';
import { PostsResolver } from '../post/post.resolver';
import { CredentialsResolver } from '../credentials/credential.resolver';
import { PostToolsGroup } from '../mcp/tools/posts.tools';

const UUID = '3f2b8c1e-4d5a-4b6c-8e7f-9a0b1c2d3e4f';
const user = { id: 'u1', tenantId: 't1', role: 'USER' } as any;
/** A real reaches() check over the list ['w1']. */
const access = (list: string[] = ['w1']) => ({
  accessFor: jest.fn().mockResolvedValue(list),
  assertRow: (a: string[], ws: string | null, what: string) => {
    if (!ws || !a.includes(ws)) throw new NotFoundException(`${what} not found.`);
  },
  roleIn: jest.fn().mockResolvedValue('MANAGER'),
});

describe('row checks', () => {
  it('getPost of another branch is not found', async () => {
    const posts = { getPost: jest.fn().mockResolvedValue({ id: 'p1', workspaceId: 'w2' }) };
    const resolver = new PostsResolver(posts as any, {} as any, {} as any, access() as any);
    await expect(resolver.getPost(user, undefined as any, 'p1')).rejects.toThrow(new NotFoundException('Post not found.'));
  });

  it('deletePost of another branch does not delete', async () => {
    const posts = { getPost: jest.fn().mockResolvedValue({ id: 'p1', workspaceId: 'w2' }), deletePost: jest.fn() };
    const resolver = new PostsResolver(posts as any, {} as any, {} as any, access() as any);
    await expect(resolver.deletePost(user, undefined as any, 'p1')).rejects.toBeInstanceOf(NotFoundException);
    expect(posts.deletePost).not.toHaveBeenCalled();
  });

  it('deleteCredential of another branch is not found', async () => {
    const creds = {
      getCredential: jest.fn().mockResolvedValue({ id: 'c1', workspaceId: 'w2', userId: 'u1' }),
      deleteCredential: jest.fn(),
    };
    const resolver = new CredentialsResolver(creds as any, {} as any, access() as any);
    await expect(resolver.deleteCredential(user, undefined as any, 'c1')).rejects.toThrow(
      new NotFoundException('Account not found.'),
    );
    expect(creds.deleteCredential).not.toHaveBeenCalled();
  });

  it('MCP get_post of another branch is not found', async () => {
    const posts = { getPost: jest.fn().mockResolvedValue({ id: 'p1', workspaceId: 'w2' }), getPublishJobState: jest.fn() };
    const group = new PostToolsGroup(posts as any, {} as any, {} as any);
    const ctx = { userId: 'u1', tenantId: 't1', access: ['w1'] } as any;
    const tool = group.tools().find((t) => t.name === 'get_post')!;
    await expect(tool.handler({ postId: UUID }, ctx)).rejects.toThrow('Post not found.');
  });
});

describe('canReachFromContext', () => {
  const ctx = (tenantId: string, workspaceAccess: any) => ({ req: { tenantId, workspaceAccess } });

  it('subscription filter drops other branches', () => {
    expect(canReachFromContext(ctx('t1', ['w1']), { tenantId: 't1', workspaceId: 'w2' })).toBe(false);
  });

  it('keeps the caller\'s branches', () => {
    expect(canReachFromContext(ctx('t1', ['w1']), { tenantId: 't1', workspaceId: 'w1' })).toBe(true);
    expect(canReachFromContext(ctx('t1', 'all'), { tenantId: 't1', workspaceId: 'w9' })).toBe(true);
  });

  it('drops another tenant and an unauthenticated connection', () => {
    expect(canReachFromContext(ctx('t1', 'all'), { tenantId: 't2', workspaceId: 'w9' })).toBe(false);
    expect(canReachFromContext({ req: {} }, { tenantId: 't1', workspaceId: 'w1' })).toBe(false);
  });
});
