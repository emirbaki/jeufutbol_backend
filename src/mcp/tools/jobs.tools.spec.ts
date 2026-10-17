import { NotFoundException } from '@nestjs/common';
import { JobToolsGroup } from './jobs.tools';
import { McpAuthContext } from '../mcp-auth.context';

const ctx: McpAuthContext = {
  userId: 'u1',
  tenantId: 't1',
  grant: { isUser: false, scopes: [] },
  keyPrefix: 'jeu_ab',
  apiBaseUrl: 'https://x/api',
};

describe('JobToolsGroup', () => {
  let jobs: { getJobStatus: jest.Mock };
  let group: JobToolsGroup;

  beforeEach(() => {
    jobs = { getJobStatus: jest.fn() };
    group = new JobToolsGroup(jobs as any);
  });

  it('defines get_job with no required scopes', () => {
    const [def] = group.tools();
    expect(def.name).toBe('get_job');
    expect(def.scopes).toEqual([]);
    expect(def.inputSchema.safeParse({ jobId: '' }).success).toBe(false);
  });

  it('get_job asks for the caller tenant and requireTenant', async () => {
    jobs.getJobStatus.mockResolvedValue({ id: 'j1', status: 'completed', progress: 100, result: { a: 1 } });
    const out = await group.tools()[0].handler({ jobId: 'j1' }, ctx);
    expect(jobs.getJobStatus).toHaveBeenCalledWith('j1', { tenantId: 't1', requireTenant: true });
    expect(out).toMatchObject({ jobId: 'j1', status: 'completed', result: { a: 1 } });
  });

  it('get_job maps not found to a three-part error', async () => {
    jobs.getJobStatus.mockRejectedValue(new NotFoundException('Job j1 not found'));
    await expect(group.tools()[0].handler({ jobId: 'j1' }, ctx)).rejects.toThrow(
      'Job not found. The jobId is wrong, expired, or from another account. Use the jobId from the tool that started the job.',
    );
  });
});
