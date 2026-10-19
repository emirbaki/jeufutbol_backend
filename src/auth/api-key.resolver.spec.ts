jest.mock('uuid', () => ({ v4: () => require('crypto').randomUUID() }));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { In } from 'typeorm';
import { ApiKeyResolver } from './api-key.resolver';
import { UserRole } from './user-role.enum';

const admin = { id: 'a1', tenantId: 't1', role: UserRole.ADMIN } as any;

describe('ApiKeyResolver branch limits', () => {
  let keys: Record<string, jest.Mock>;
  let workspaces: { find: jest.Mock };
  let resolver: ApiKeyResolver;

  beforeEach(() => {
    keys = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => x),
      findOne: jest.fn().mockResolvedValue({ id: 'k1', tenantId: 't1', workspaceIds: [], defaultWorkspaceId: null }),
    };
    workspaces = { find: jest.fn().mockResolvedValue([{ id: 'w1' }, { id: 'w2' }]) };
    resolver = new ApiKeyResolver(keys as any, workspaces as any);
  });

  it('createApiKey saves the branch list and the default', async () => {
    await resolver.createApiKey(admin, { name: 'k', scopes: [], workspaceIds: ['w1', 'w2'], defaultWorkspaceId: 'w2' } as any);
    expect(workspaces.find).toHaveBeenCalledWith({ where: { id: In(['w1', 'w2']), tenantId: 't1' } });
    expect(keys.create).toHaveBeenCalledWith(expect.objectContaining({ workspaceIds: ['w1', 'w2'], defaultWorkspaceId: 'w2' }));
  });

  it('createApiKey with no list reaches all branches', async () => {
    await resolver.createApiKey(admin, { name: 'k', scopes: [] } as any);
    expect(keys.create).toHaveBeenCalledWith(expect.objectContaining({ workspaceIds: [], defaultWorkspaceId: null }));
  });

  it('createApiKey rejects a default outside the list', async () => {
    await expect(
      resolver.createApiKey(admin, { name: 'k', scopes: [], workspaceIds: ['w1'], defaultWorkspaceId: 'w2' } as any),
    ).rejects.toThrow(new BadRequestException('The default branch must be one of the selected branches.'));
  });

  it('createApiKey rejects a branch of another tenant', async () => {
    workspaces.find.mockResolvedValue([{ id: 'w1' }]);
    await expect(
      resolver.createApiKey(admin, { name: 'k', scopes: [], workspaceIds: ['w1', 'w-other'] } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updateApiKeyWorkspaces changes the list', async () => {
    workspaces.find.mockResolvedValue([{ id: 'w1' }]);
    const out = await resolver.updateApiKeyWorkspaces(admin, 'k1', ['w1'], 'w1');
    expect(out).toMatchObject({ workspaceIds: ['w1'], defaultWorkspaceId: 'w1' });
  });
});
