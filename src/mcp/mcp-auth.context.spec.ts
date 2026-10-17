import { ForbiddenException } from '@nestjs/common';
import { buildMcpAuthContext } from './mcp-auth.context';

describe('buildMcpAuthContext', () => {
  it('builds a context from a user', () => {
    const ctx = buildMcpAuthContext({ user: { id: 'u1', tenantId: 't1' } as any }, 'https://x/api');
    expect(ctx).toEqual({
      userId: 'u1',
      tenantId: 't1',
      grant: { isUser: true, scopes: [] },
      keyPrefix: 'user',
      apiBaseUrl: 'https://x/api',
    });
  });

  it('builds a context from an API key', () => {
    const ctx = buildMcpAuthContext(
      { apiKey: { createdByUserId: 'u1', tenantId: 't1', scopes: ['posts:read'], keyPrefix: 'jeu_ab' } as any },
      'https://x/api',
    );
    expect(ctx.userId).toBe('u1');
    expect(ctx.tenantId).toBe('t1');
    expect(ctx.grant).toEqual({ isUser: false, scopes: ['posts:read'] });
    expect(ctx.keyPrefix).toBe('jeu_ab');
  });

  it('uses the API key scopes when the request also has a user', () => {
    const ctx = buildMcpAuthContext(
      {
        user: { id: 'admin', tenantId: 't1' } as any,
        apiKey: { createdByUserId: 'admin', tenantId: 't1', scopes: ['posts:read'], keyPrefix: 'tenant' } as any,
      },
      '',
    );
    expect(ctx.grant).toEqual({ isUser: false, scopes: ['posts:read'] });
  });

  it('rejects an API key with no user', () => {
    const build = () =>
      buildMcpAuthContext({ apiKey: { createdByUserId: null, tenantId: 't1', scopes: [] } as any }, '');
    expect(build).toThrow(ForbiddenException);
    expect(build).toThrow('This API key has no user. Make a new key from a user account.');
  });
});
