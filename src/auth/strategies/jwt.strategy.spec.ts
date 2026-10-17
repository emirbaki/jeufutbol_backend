// This spec loads code that imports the ESM-only uuid package.
jest.mock('uuid', () => ({ v4: () => require('crypto').randomUUID() }));

import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let auth: { validateUser: jest.Mock };
  let strategy: JwtStrategy;

  beforeEach(() => {
    auth = { validateUser: jest.fn().mockResolvedValue({ id: 'first-user' }) };
    strategy = new JwtStrategy(auth as any, { get: () => 's' } as any);
  });

  it('rejects an upload token as a login', async () => {
    await expect(strategy.validate({ type: 'upload', uploadId: 'u', tenantId: 't1' } as any)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(auth.validateUser).not.toHaveBeenCalled();
  });

  it('accepts a user JWT', async () => {
    await expect(strategy.validate({ sub: 'u1', email: 'a@b' })).resolves.toEqual({ id: 'first-user' });
    expect(auth.validateUser).toHaveBeenCalledWith('u1');
  });
});
