// CombinedAuthGuard loads typeorm, which loads the ESM-only uuid package.
jest.mock('uuid', () => ({ v4: () => require('crypto').randomUUID() }));

import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { CombinedAuthGuard } from './combined-auth.guard';

function httpCtx(headers: Record<string, string>): ExecutionContext {
  const req = { headers };
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('CombinedAuthGuard', () => {
  let jwt: { verify: jest.Mock };
  let userRepo: { findOne: jest.Mock };
  let apiKeyRepo: { findOne: jest.Mock; update: jest.Mock };
  let tenantRepo: { findOne: jest.Mock };
  let guard: CombinedAuthGuard;

  beforeEach(() => {
    jwt = { verify: jest.fn() };
    userRepo = { findOne: jest.fn().mockResolvedValue({ id: 'first-user', isActive: true }) };
    apiKeyRepo = { findOne: jest.fn().mockResolvedValue(null), update: jest.fn() };
    tenantRepo = { findOne: jest.fn() };
    guard = new CombinedAuthGuard(jwt as any, userRepo as any, apiKeyRepo as any, tenantRepo as any);
  });

  it('rejects an upload token as a login', async () => {
    jwt.verify.mockReturnValue({ type: 'upload', uploadId: 'u', tenantId: 't1' });
    await expect(guard.canActivate(httpCtx({ authorization: 'Bearer x' }))).rejects.toThrow(UnauthorizedException);
    expect(userRepo.findOne).not.toHaveBeenCalled();
    expect(apiKeyRepo.findOne).not.toHaveBeenCalled();
  });

  it('still accepts a user JWT', async () => {
    jwt.verify.mockReturnValue({ sub: 'u1' });
    await expect(guard.canActivate(httpCtx({ authorization: 'Bearer x' }))).resolves.toBe(true);
    expect(userRepo.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'u1' } }));
  });
});
