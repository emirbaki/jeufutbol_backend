jest.mock('uuid', () => ({ v4: () => require('crypto').randomUUID() }));

import { MonitoringService } from './monitoring.service';

describe('MonitoringService workspaces', () => {
  let repo: { findOne: jest.Mock; find: jest.Mock; save: jest.Mock; create: jest.Mock };
  let svc: MonitoringService;

  beforeEach(() => {
    repo = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn(async (x) => ({ id: 'mp1', ...x })),
      create: jest.fn((x) => x),
    };
    svc = new MonitoringService(repo as any, { rettiwt: {} } as any, {} as any);
    jest.spyOn(svc, 'getUserProfile').mockResolvedValue({ id: 'x1', displayName: 'Club' } as any);
  });

  it('addProfile allows the same username in another workspace', async () => {
    repo.findOne.mockResolvedValue(null);
    await svc.addProfile('u1', 't1', { xUsername: '@club', fetchTweets: false } as any, 'w2');
    expect(repo.findOne).toHaveBeenCalledWith({ where: { workspaceId: 'w2', xUsername: 'club' } });
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 't1', workspaceId: 'w2' }));
  });

  it('getMonitoredProfiles filters by workspace', async () => {
    await svc.getMonitoredProfiles('u1', 't1', 'w2');
    expect(repo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 't1', workspaceId: 'w2', isActive: true } }),
    );
  });
});
