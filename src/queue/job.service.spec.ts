import { NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { JobService } from './job.service';

const fakeJob = (data: Record<string, unknown>, id = '5') => ({
  id,
  data,
  getState: async () => 'completed',
  progress: 100,
  returnvalue: { ok: 1 },
  timestamp: 0,
});

describe('JobService', () => {
  let ai: { getJob: jest.Mock };
  let monitoring: { getJob: jest.Mock };
  let mediaImport: { getJob: jest.Mock };
  let svc: JobService;

  beforeEach(() => {
    ai = { getJob: jest.fn().mockResolvedValue(undefined) };
    monitoring = { getJob: jest.fn().mockResolvedValue(undefined) };
    mediaImport = { getJob: jest.fn().mockResolvedValue(undefined) };
    svc = new JobService(
      ai as unknown as Queue,
      monitoring as unknown as Queue,
      mediaImport as unknown as Queue,
    );
  });

  it('hides a job from a different tenant', async () => {
    ai.getJob.mockResolvedValue(fakeJob({ tenantId: 't1' }));
    await expect(svc.getJobStatus('5', { tenantId: 't2' })).rejects.toThrow(
      'Job 5 not found',
    );
  });

  it('shows a job of the same tenant', async () => {
    ai.getJob.mockResolvedValue(fakeJob({ tenantId: 't1' }));
    await expect(
      svc.getJobStatus('5', { tenantId: 't1' }),
    ).resolves.toMatchObject({ id: '5' });
  });

  it('shows a job with no tenantId to GraphQL callers', async () => {
    monitoring.getJob.mockResolvedValue(fakeJob({ profileId: 'p' }));
    await expect(
      svc.getJobStatus('5', { tenantId: 't1' }),
    ).resolves.toMatchObject({ id: '5' });
  });

  it('hides a job with no tenantId when requireTenant is set', async () => {
    monitoring.getJob.mockResolvedValue(fakeJob({ profileId: 'p' }));
    await expect(
      svc.getJobStatus('5', { tenantId: 't1', requireTenant: true }),
    ).rejects.toThrow('Job 5 not found');
  });

  it('finds a job in the media import queue', async () => {
    mediaImport.getJob.mockResolvedValue(
      fakeJob({ tenantId: 't1' }, 'media-import-abc'),
    );
    await expect(
      svc.getJobStatus('media-import-abc', { tenantId: 't1' }),
    ).resolves.toMatchObject({ id: 'media-import-abc' });
  });

  it('throws NotFoundException when the job is in no queue', async () => {
    await expect(svc.getJobStatus('9', { tenantId: 't1' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('hides the result of a job from a different tenant', async () => {
    ai.getJob.mockResolvedValue(fakeJob({ tenantId: 't1' }));
    await expect(svc.getJobResult('5', { tenantId: 't2' })).rejects.toThrow(
      'Job 5 not found',
    );
  });

  it('does not retry a job from a different tenant', async () => {
    const job = {
      ...fakeJob({ tenantId: 't1' }),
      isFailed: jest.fn(),
      retry: jest.fn(),
    };
    ai.getJob.mockResolvedValue(job);
    await expect(svc.retryJob('5', { tenantId: 't2' })).rejects.toThrow(
      'Job 5 not found',
    );
    expect(job.retry).not.toHaveBeenCalled();
  });

  it('does not list the media import queue', async () => {
    await expect(svc.getQueueJobs('media-import')).rejects.toThrow(
      'Unknown queue: media-import',
    );
  });
});
