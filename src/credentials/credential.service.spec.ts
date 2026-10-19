// The entities import code that imports the ESM-only uuid package.
jest.mock('uuid', () => ({ v4: () => require('crypto').randomUUID() }));

import { CredentialsService } from './credential.service';
import { PlatformName } from '../entities/credential.entity';

describe('CredentialsService (tenant and workspace)', () => {
  let repo: { find: jest.Mock; findOne: jest.Mock; save: jest.Mock; delete: jest.Mock };
  let workspaces: { resolve: jest.Mock };
  let svc: CredentialsService;

  beforeEach(() => {
    repo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      save: jest.fn(async (x) => x),
      delete: jest.fn(),
    };
    workspaces = { resolve: jest.fn() };
    const enc = { encrypt: (v: string) => `enc:${v}` };
    svc = new CredentialsService(repo as any, enc as any, {} as any, workspaces as any);
  });

  it('listCredentials filters by tenant, not by user', async () => {
    await svc.listCredentials('t1');
    expect(repo.find).toHaveBeenCalledWith({ where: { tenantId: 't1', isActive: true }, order: { createdAt: 'DESC' } });
  });

  it('listCredentials adds the workspace and platform filters', async () => {
    await svc.listCredentials('t1', { workspaceId: 'w1', platform: PlatformName.X });
    expect(repo.find).toHaveBeenCalledWith({
      where: { tenantId: 't1', isActive: true, workspaceId: 'w1', platform: 'x' },
      order: { createdAt: 'DESC' },
    });
  });

  it('getCredential uses id and tenant only', async () => {
    await svc.getCredential('c1', 't1');
    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'c1', tenantId: 't1' } });
  });

  it('deleteCredential uses id and tenant only', async () => {
    await svc.deleteCredential('c1', 't1');
    expect(repo.delete).toHaveBeenCalledWith({ id: 'c1', tenantId: 't1' });
  });

  it('pickPublishCredential gives the newest account', async () => {
    repo.find.mockResolvedValue([{ id: 'c2' }, { id: 'c1' }]);
    const out = await svc.pickPublishCredential('t1', { id: 'w2', slug: 'football' } as any, PlatformName.X);
    expect(out.id).toBe('c2');
    expect(repo.find).toHaveBeenCalledWith({
      where: { tenantId: 't1', isActive: true, workspaceId: 'w2', platform: 'x' },
      order: { createdAt: 'DESC' },
    });
  });

  it('pickPublishCredential fails with the workspace slug', async () => {
    await expect(
      svc.pickPublishCredential('t1', { id: 'w2', slug: 'football' } as any, PlatformName.X),
    ).rejects.toThrow('No x account is connected in workspace "football".');
  });

  it('moveCredential saves the resolved workspace', async () => {
    workspaces.resolve.mockResolvedValue({ id: 'w2' });
    const credential = { id: 'c1', tenantId: 't1', workspaceId: 'w1' } as any;
    await svc.moveCredential(credential, 'cinema');
    expect(workspaces.resolve).toHaveBeenCalledWith('t1', 'cinema');
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'w2' }));
  });

  it('saveOAuthCredential stores the workspace', async () => {
    await svc.saveOAuthCredential('u1', 't1', 'w1', PlatformName.X, 'Main X', {
      accessToken: 'a',
      accountId: '1',
      accountName: 'jeu',
    });
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', tenantId: 't1', workspaceId: 'w1' }));
  });
});
