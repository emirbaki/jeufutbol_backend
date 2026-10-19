// The entities import code that imports the ESM-only uuid package.
jest.mock('uuid', () => ({ v4: () => require('crypto').randomUUID() }));

import { ForbiddenException } from '@nestjs/common';
import { WorkspacesResolver } from './workspaces.resolver';
import { UserRole } from '../auth/user-role.enum';

const user = (role: UserRole) => ({ id: 'u1', tenantId: 't1', role }) as any;
const apiKey = { tenantId: 't2' } as any;

describe('WorkspacesResolver', () => {
  let service: Record<string, jest.Mock>;
  let resolver: WorkspacesResolver;

  beforeEach(() => {
    service = {
      list: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn().mockResolvedValue(true),
    };
    resolver = new WorkspacesResolver(service as any, { accessFor: jest.fn().mockResolvedValue('all') } as any);
  });

  it.each(['updateWorkspace', 'deleteWorkspace', 'createWorkspace'] as const)(
    '%s rejects an API key that does not reach all branches',
    async (name) => {
      const access = { accessFor: jest.fn().mockResolvedValue(['w1']) };
      resolver = new WorkspacesResolver(service as any, access as any);
      const call =
        name === 'createWorkspace'
          ? resolver.createWorkspace(undefined, apiKey, { name: 'x' })
          : name === 'updateWorkspace'
            ? resolver.updateWorkspace(undefined, apiKey, 'w9', { name: 'x' })
            : resolver.deleteWorkspace(undefined, apiKey, 'w9');
      await expect(call).rejects.toThrow(
        new ForbiddenException('Only an admin, or an API key for all branches, can manage workspaces.'),
      );
      expect(access.accessFor).toHaveBeenCalledWith(undefined, apiKey);
      expect(service.create).not.toHaveBeenCalled();
      expect(service.update).not.toHaveBeenCalled();
      expect(service.remove).not.toHaveBeenCalled();
    },
  );

  it('workspaces lists for the tenant of the user', async () => {
    await resolver.workspaces(user(UserRole.USER), undefined);
    expect(service.list).toHaveBeenCalledWith('t1', 'all');
  });

  it('workspaces uses the tenant of an API key', async () => {
    await resolver.workspaces(undefined, apiKey);
    expect(service.list).toHaveBeenCalledWith('t2', 'all');
  });

  it.each([UserRole.USER, UserRole.MANAGER])('createWorkspace rejects a %s', async (role) => {
    await expect(resolver.createWorkspace(user(role), undefined, { name: 'Football' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(service.create).not.toHaveBeenCalled();
  });

  it('createWorkspace passes for an ADMIN', async () => {
    await resolver.createWorkspace(user(UserRole.ADMIN), undefined, { name: 'Football' });
    expect(service.create).toHaveBeenCalledWith('t1', { name: 'Football' });
  });

  it('updateWorkspace rejects a USER', async () => {
    await expect(resolver.updateWorkspace(user(UserRole.USER), undefined, 'w9', { name: 'x' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('deleteWorkspace passes for an API key with no user', async () => {
    await expect(resolver.deleteWorkspace(undefined, apiKey, 'w9')).resolves.toBe(true);
    expect(service.remove).toHaveBeenCalledWith('t2', 'w9');
  });
});
