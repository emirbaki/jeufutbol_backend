// PostsService imports code that imports the ESM-only uuid package.
jest.mock('uuid', () => ({ v4: () => require('crypto').randomUUID() }));

import { AccountToolsGroup } from './accounts.tools';
import { McpAuthContext } from '../mcp-auth.context';

const ctx: McpAuthContext = {
  userId: 'u1',
  tenantId: 't1',
  grant: { isUser: false, scopes: [] },
  keyPrefix: 'jeu_ab',
  apiBaseUrl: 'https://x/api',
  access: 'all',
};
const WORKSPACES = [
  { id: 'w1', slug: 'general', name: 'General', isDefault: true },
  { id: 'w2', slug: 'football', name: 'Football', isDefault: false },
];

describe('AccountToolsGroup', () => {
  let creds: { listCredentials: jest.Mock };
  let posts: { getTikTokCreatorInfo: jest.Mock };
  let workspaces: { list: jest.Mock; resolve: jest.Mock };
  let group: AccountToolsGroup;
  const tool = (name: string) => group.tools().find((t) => t.name === name)!;

  beforeEach(() => {
    creds = { listCredentials: jest.fn() };
    posts = { getTikTokCreatorInfo: jest.fn() };
    workspaces = {
      list: jest.fn().mockResolvedValue(WORKSPACES),
      resolve: jest.fn().mockResolvedValue(WORKSPACES[1]),
    };
    group = new AccountToolsGroup(creds as any, posts as any, workspaces as any);
  });

  it('maps the token state and the workspace', async () => {
    creds.listCredentials.mockResolvedValue([
      { id: 'c1', platform: 'youtube', accountName: 'A', tokenExpiresAt: null, workspaceId: 'w1' },
      { id: 'c2', platform: 'tiktok', accountName: 'B', tokenExpiresAt: new Date(Date.now() - 1000), workspaceId: 'w2' },
      { id: 'c3', platform: 'x', accountName: 'C', tokenExpiresAt: new Date(Date.now() + 60000), workspaceId: null },
    ]);
    const out: any = await tool('list_connected_accounts').handler({}, ctx);
    expect(out.accounts.map((a) => a.tokenState)).toEqual(['unknown', 'expired', 'valid']);
    expect(out.accounts.map((a) => a.workspace)).toEqual(['general', 'football', 'general']);
    expect(out.accounts[0]).toEqual({
      credentialId: 'c1',
      platform: 'youtube',
      accountName: 'A',
      workspace: 'general',
      tokenState: 'unknown',
    });
    expect(out.next).toBe(
      'Use these platform names in create_post targetPlatforms, and the workspace value in create_post workspace.',
    );
  });

  it('passes the platform filter and says how to connect an account', async () => {
    creds.listCredentials.mockResolvedValue([]);
    const out: any = await tool('list_connected_accounts').handler({ platform: 'x' }, ctx);
    expect(creds.listCredentials).toHaveBeenCalledWith('t1', { workspaceId: undefined, platform: 'x' });
    expect(out).toEqual({ accounts: [], next: 'No accounts are connected. Connect one in JeuHub Settings.' });
  });

  it('list_connected_accounts filters by workspace', async () => {
    creds.listCredentials.mockResolvedValue([]);
    await tool('list_connected_accounts').handler({ workspace: 'football' }, ctx);
    expect(workspaces.resolve).toHaveBeenCalledWith('t1', 'football', 'all');
    expect(creds.listCredentials).toHaveBeenCalledWith('t1', { workspaceId: 'w2', platform: undefined });
  });

  it('list_workspaces counts accounts per workspace', async () => {
    creds.listCredentials.mockResolvedValue([{ workspaceId: 'w2' }, { workspaceId: 'w2' }]);
    const out: any = await tool('list_workspaces').handler({}, ctx);
    expect(creds.listCredentials).toHaveBeenCalledTimes(1);
    expect(out.workspaces).toEqual([
      { workspace: 'general', name: 'General', isDefault: true, accountCount: 0 },
      { workspace: 'football', name: 'Football', isDefault: false, accountCount: 2 },
    ]);
    expect(out.next).toBe('Pass the workspace value to list_connected_accounts and create_post.');
  });

  it('get_tiktok_creator_info passes the workspace', async () => {
    posts.getTikTokCreatorInfo.mockResolvedValue({ privacy_level_options: ['SELF_ONLY'] });
    await expect(tool('get_tiktok_creator_info').handler({ workspace: 'football' }, ctx)).resolves.toEqual({
      privacy_level_options: ['SELF_ONLY'],
    });
    expect(workspaces.resolve).toHaveBeenCalledWith('t1', 'football', 'all');
    expect(posts.getTikTokCreatorInfo).toHaveBeenCalledWith('u1', 't1', 'w2');
  });

  it('has the correct scopes', () => {
    expect(tool('list_workspaces').scopes).toEqual(['credentials:read']);
    expect(tool('list_connected_accounts').scopes).toEqual(['credentials:read']);
    expect(tool('get_tiktok_creator_info').scopes).toEqual(['posts:read']);
  });

  it('list_workspaces shows only the key branches', async () => {
    creds.listCredentials.mockResolvedValue([]);
    await tool('list_workspaces').handler({}, { ...ctx, access: ['w2'] });
    expect(workspaces.list).toHaveBeenCalledWith('t1', ['w2']);
  });

  it('list_connected_accounts hides accounts of other branches', async () => {
    creds.listCredentials.mockResolvedValue([
      { id: 'c1', platform: 'x', workspaceId: 'w1' },
      { id: 'c2', platform: 'x', workspaceId: 'w2' },
    ]);
    const out: any = await tool('list_connected_accounts').handler({}, { ...ctx, access: ['w2'] });
    expect(out.accounts.map((a) => a.credentialId)).toEqual(['c2']);
  });
});
