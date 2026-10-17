jest.mock('uuid', () => ({ v4: () => require('crypto').randomUUID() }));

import { ScheduledPostProcessor } from './scheduled-post.processor';
import { Logger } from '@nestjs/common';

describe('ScheduledPostProcessor', () => {
  let posts: { publishPost: jest.Mock; retryPublishPost: jest.Mock };
  let processor: ScheduledPostProcessor;

  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  beforeEach(() => {
    posts = { publishPost: jest.fn(), retryPublishPost: jest.fn() };
    processor = new ScheduledPostProcessor(posts as any, {} as any);
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
});
