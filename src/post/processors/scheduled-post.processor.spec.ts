jest.mock('uuid', () => ({ v4: () => require('crypto').randomUUID() }));

import { ScheduledPostProcessor } from './scheduled-post.processor';
import { Logger } from '@nestjs/common';

describe('ScheduledPostProcessor', () => {
  let posts: { publishPost: jest.Mock; retryPublishPost: jest.Mock; getPostTenantId: jest.Mock };
  let processor: ScheduledPostProcessor;

  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  beforeEach(() => {
    posts = {
      publishPost: jest.fn(),
      retryPublishPost: jest.fn(),
      getPostTenantId: jest.fn().mockResolvedValue('t1'),
    };
    processor = new ScheduledPostProcessor(posts as any, { publish: jest.fn() } as any);
  });

  it('calls retryPublishPost for mode retry', async () => {
    await processor.process({ id: '1', data: { postId: 'p1', userId: 'u1', tenantId: 't1', mode: 'retry' } } as any);
    expect(posts.retryPublishPost).toHaveBeenCalledWith('p1', 'u1', 't1');
    expect(posts.publishPost).not.toHaveBeenCalled();
  });

  it('calls publishPost when mode is missing', async () => {
    await processor.process({ id: '1', data: { postId: 'p1', userId: 'u1', tenantId: 't1' } } as any);
    expect(posts.publishPost).toHaveBeenCalledWith('p1', 'u1', 't1');
    expect(posts.retryPublishPost).not.toHaveBeenCalled();
  });

  // After a tenant merge, a queued job still carries the old tenant of the post.
  it('uses the tenant of the post, not the job data', async () => {
    posts.getPostTenantId.mockResolvedValue('t-main');
    await processor.process({ id: '1', data: { postId: 'p1', userId: 'u1', tenantId: 't-old' } } as any);
    expect(posts.getPostTenantId).toHaveBeenCalledWith('p1');
    expect(posts.publishPost).toHaveBeenCalledWith('p1', 'u1', 't-main');
  });

  it('uses the job tenant when the post is missing', async () => {
    posts.getPostTenantId.mockResolvedValue(null);
    await processor.process({ id: '1', data: { postId: 'p1', userId: 'u1', tenantId: 't-old' } } as any);
    expect(posts.publishPost).toHaveBeenCalledWith('p1', 'u1', 't-old');
  });

  it('retry mode uses the same tenant', async () => {
    posts.getPostTenantId.mockResolvedValue('t-main');
    await processor.process({ id: '1', data: { postId: 'p1', userId: 'u1', tenantId: 't-old', mode: 'retry' } } as any);
    expect(posts.retryPublishPost).toHaveBeenCalledWith('p1', 'u1', 't-main');
  });
});
