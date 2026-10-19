jest.mock('uuid', () => ({ v4: () => require('crypto').randomUUID() }));

import { AnalyticsService } from './analytics.service';

describe('AnalyticsService workspaces', () => {
  let published: { find: jest.Mock };
  let credentials: { listCredentials: jest.Mock; getTenantCredentials: jest.Mock; getDecryptedAccessToken: jest.Mock };
  let svc: AnalyticsService;

  beforeEach(() => {
    published = { find: jest.fn().mockResolvedValue([]) };
    credentials = {
      listCredentials: jest.fn().mockResolvedValue([]),
      getTenantCredentials: jest.fn().mockResolvedValue([]),
      getDecryptedAccessToken: jest.fn(),
    };
    const settings = { findOne: jest.fn().mockResolvedValue({ id: 's1', tenantId: 't1' }) };
    svc = new AnalyticsService({ find: jest.fn().mockResolvedValue([]) } as any, settings as any, published as any, credentials as any, {} as any);
  });

  it('getAnalyticsData filters published posts by the post workspace', async () => {
    await svc.getAnalyticsData('t1', '7days', 'w2');
    const where = published.find.mock.calls[0][0].where;
    expect(where.tenantId).toBe('t1');
    expect(where.post).toEqual({ workspaceId: 'w2' });
  });

  it('getFollowerCounts uses the accounts of the workspace', async () => {
    await svc.getFollowerCounts('t1', 'w2');
    expect(credentials.getTenantCredentials).not.toHaveBeenCalled();
    expect(credentials.listCredentials).toHaveBeenCalledWith('t1', { workspaceId: 'w2', platform: 'instagram' });
  });
});
