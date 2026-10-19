// The entities import code that imports the ESM-only uuid package.
jest.mock('uuid', () => ({ v4: () => require('crypto').randomUUID() }));

import { ForbiddenException } from '@nestjs/common';
import { assertCanManageCredential, canManageCredential } from './credential-access';
import { UserRole } from '../auth/user-role.enum';

const credential = { userId: 'u1' } as any;
const user = (id: string, role: UserRole) => ({ id, role }) as any;

describe('canManageCredential', () => {
  it('allows an API key', () => {
    expect(canManageCredential(undefined, credential)).toBe(true);
  });

  it.each([UserRole.ADMIN, UserRole.MANAGER])('allows %s', (role) => {
    expect(canManageCredential(user('u2', role), credential)).toBe(true);
  });

  it('allows the user who connected the account', () => {
    expect(canManageCredential(user('u1', UserRole.USER), credential)).toBe(true);
  });

  it('blocks another USER', () => {
    expect(canManageCredential(user('u2', UserRole.USER), credential)).toBe(false);
    expect(() => assertCanManageCredential(user('u2', UserRole.USER), credential)).toThrow(ForbiddenException);
  });
});
