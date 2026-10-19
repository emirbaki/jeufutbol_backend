// The workspace helpers import entities that import the ESM-only uuid package.
jest.mock('uuid', () => ({ v4: () => require('crypto').randomUUID() }));

import { GqlExecutionContext } from '@nestjs/graphql';
import { GraphqlCacheInterceptor, graphqlCacheKey } from './graphql-cache.interceptor';

const UUID = '123e4567-e89b-42d3-a456-426614174000';

function contextWith(req: any, fieldName = 'getTimelineTweets', args: object = {}, operation = 'query') {
  jest.spyOn(GqlExecutionContext, 'create').mockReturnValue({
    getInfo: () => ({ fieldName, operation: { operation } }),
    getArgs: () => args,
    getContext: () => ({ req }),
  } as any);
  return {} as any;
}

describe('GraphqlCacheInterceptor', () => {
  const interceptor = new GraphqlCacheInterceptor({} as any, {} as any);

  afterEach(() => jest.restoreAllMocks());

  it('key includes the workspace header', () => {
    const ctx = contextWith({ user: { tenantId: 't1' }, headers: { 'x-workspace-id': UUID } });
    expect(interceptor.trackBy(ctx)).toBe(`t1:${UUID}:getTimelineTweets:{}`);
  });

  it('uses the tenant of an API key', () => {
    const ctx = contextWith({ apiKey: { tenantId: 't2' }, headers: { 'x-workspace-id': UUID } });
    expect(interceptor.trackBy(ctx)).toBe(`t2:${UUID}:getTimelineTweets:{}`);
  });

  it('no cache without a header', () => {
    expect(interceptor.trackBy(contextWith({ user: { tenantId: 't1' }, headers: {} }))).toBeUndefined();
  });

  it('no cache with a slug header', () => {
    const ctx = contextWith({ user: { tenantId: 't1' }, headers: { 'x-workspace-id': 'football' } });
    expect(interceptor.trackBy(ctx)).toBeUndefined();
  });

  it('never caches a mutation', () => {
    const ctx = contextWith(
      { user: { tenantId: 't1' }, headers: { 'x-workspace-id': UUID } },
      'addMonitoredProfile',
      { xUsername: 'club' },
      'mutation',
    );
    expect(interceptor.trackBy(ctx)).toBeUndefined();
  });

  it.each(['getInsights', 'getMonitoredProfiles', 'getMonitoredProfile'])(
    'never caches %s, because mutations change it',
    (field) => {
      const ctx = contextWith({ user: { tenantId: 't1' }, headers: { 'x-workspace-id': UUID } }, field, { limit: 50 });
      expect(interceptor.trackBy(ctx)).toBeUndefined();
    },
  );

  it('no cache without a tenant', () => {
    expect(interceptor.trackBy(contextWith({ headers: { 'x-workspace-id': UUID } }))).toBeUndefined();
  });
});

describe('graphqlCacheKey', () => {
  it('sorts the args', () => {
    expect(graphqlCacheKey('t1', 'w1', 'f', { b: 1, a: 2 })).toBe(graphqlCacheKey('t1', 'w1', 'f', { a: 2, b: 1 }));
    expect(graphqlCacheKey('t1', 'w1', 'f', { b: 1, a: 2 })).toBe('t1:w1:f:{"a":2,"b":1}');
  });

  it('defaults the args to an empty object', () => {
    expect(graphqlCacheKey('t1', 'w1', 'getMonitoredProfiles')).toBe('t1:w1:getMonitoredProfiles:{}');
  });
});
