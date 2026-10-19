// The entities import code that imports the ESM-only uuid package.
jest.mock('uuid', () => ({ v4: () => require('crypto').randomUUID() }));

import { ForbiddenException } from '@nestjs/common';
import { assertCanManageCredential, canManageCredential } from './credential-access';
import { WorkspaceRole } from '../entities/workspace-member.entity';

const credential = { userId: 'u1', workspaceId: 'w1' } as any;
const user = (id: string) => ({ id }) as any;

describe('canManageCredential', () => {
  it('allows an API key', () => {
    expect(canManageCredential(null, undefined, credential)).toBe(true);
  });

  it('ADMIN can manage', () => {
    expect(canManageCredential('ADMIN', user('u2'), credential)).toBe(true);
  });

  it('MANAGER of the account branch can manage', () => {
    expect(canManageCredential(WorkspaceRole.MANAGER, user('u2'), credential)).toBe(true);
  });

  it('USER of the branch can manage only their own account', () => {
    expect(canManageCredential(WorkspaceRole.USER, user('u1'), credential)).toBe(true);
    expect(canManageCredential(WorkspaceRole.USER, user('u2'), credential)).toBe(false);
  });

  it('a MANAGER of another branch cannot (no role in this branch)', () => {
    expect(canManageCredential(null, user('u2'), credential)).toBe(false);
    expect(() => assertCanManageCredential(null, user('u2'), credential)).toThrow(ForbiddenException);
  });
});
