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
};

describe('AccountToolsGroup', () => {
  let creds: { listCredentials: jest.Mock };
  let posts: { getTikTokCreatorInfo: jest.Mock };
  let group: AccountToolsGroup;
  const tool = (name: string) => group.tools().find((t) => t.name === name)!;

  beforeEach(() => {
    creds = { listCredentials: jest.fn() };
    posts = { getTikTokCreatorInfo: jest.fn() };
    group = new AccountToolsGroup(creds as any, posts as any);
  });

  it('maps the token state', async () => {
    creds.listCredentials.mockResolvedValue([
      { id: 'c1', platform: 'youtube', accountName: 'A', tokenExpiresAt: null },
      { id: 'c2', platform: 'tiktok', accountName: 'B', tokenExpiresAt: new Date(Date.now() - 1000) },
      { id: 'c3', platform: 'x', accountName: 'C', tokenExpiresAt: new Date(Date.now() + 60000) },
    ]);
    const out: any = await tool('list_connected_accounts').handler({}, ctx);
    expect(out.accounts.map((a) => a.tokenState)).toEqual(['unknown', 'expired', 'valid']);
    expect(out.accounts[0]).toEqual({ credentialId: 'c1', platform: 'youtube', accountName: 'A', tokenState: 'unknown' });
    expect(out.next).toBe('Use these platform names in create_post targetPlatforms.');
  });

  it('passes the platform filter and says how to connect an account', async () => {
    creds.listCredentials.mockResolvedValue([]);
    const out: any = await tool('list_connected_accounts').handler({ platform: 'x' }, ctx);
    expect(creds.listCredentials).toHaveBeenCalledWith('t1', { platform: 'x' });
    expect(out).toEqual({ accounts: [], next: 'No accounts are connected. Connect one in JeuHub Settings.' });
  });

  it('get_tiktok_creator_info gives the service result', async () => {
    posts.getTikTokCreatorInfo.mockResolvedValue({ privacy_level_options: ['SELF_ONLY'] });
    await expect(tool('get_tiktok_creator_info').handler({}, ctx)).resolves.toEqual({
      privacy_level_options: ['SELF_ONLY'],
    });
    expect(posts.getTikTokCreatorInfo).toHaveBeenCalledWith('u1', 't1');
  });

  it('has the correct scopes', () => {
    expect(tool('list_connected_accounts').scopes).toEqual(['credentials:read']);
    expect(tool('get_tiktok_creator_info').scopes).toEqual(['posts:read']);
  });
});
