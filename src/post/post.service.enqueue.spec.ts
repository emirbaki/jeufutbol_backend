jest.mock('uuid', () => ({ v4: () => require('crypto').randomUUID() }));

import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { PostsService } from './post.service';
import { Post, PostStatus } from '../entities/post.entity';
import { PublishedPost } from '../entities/published-post.entity';
import { QUEUE_NAMES } from 'src/queue/queue.config';
import { PostGatewayFactory } from './post-gateway.factory';
import { CredentialsService } from 'src/credentials/credential.service';
import { UploadService } from 'src/upload/upload.service';
import { TiktokPostGateway } from './gateways/tiktok.gateway';

describe('PostsService.enqueuePublish', () => {
  let svc: PostsService;
  let queue: { getJob: jest.Mock; add: jest.Mock };
  let postRepository: { find: jest.Mock; save: jest.Mock };
  let publishedPostRepository: { find: jest.Mock; remove: jest.Mock };

  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  beforeEach(async () => {
    queue = { getJob: jest.fn(), add: jest.fn() };
    postRepository = { find: jest.fn().mockResolvedValue([]), save: jest.fn() };
    publishedPostRepository = { find: jest.fn(), remove: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        PostsService,
        { provide: getRepositoryToken(Post), useValue: postRepository },
        { provide: getRepositoryToken(PublishedPost), useValue: publishedPostRepository },
        { provide: getQueueToken(QUEUE_NAMES.ASYNC_POST_POLLING), useValue: {} },
        { provide: getQueueToken(QUEUE_NAMES.SCHEDULED_POSTS), useValue: queue },
        { provide: 'PUB_SUB', useValue: { publish: jest.fn() } },
        { provide: PostGatewayFactory, useValue: {} },
        { provide: CredentialsService, useValue: {} },
        { provide: UploadService, useValue: {} },
        { provide: TiktokPostGateway, useValue: {} },
      ],
    }).compile();
    svc = moduleRef.get(PostsService);
    jest
      .spyOn(svc, 'getPost')
      .mockResolvedValue({ id: 'p1', status: PostStatus.DRAFT } as any);
  });

  it('adds a job with attempts 1 and delay 0', async () => {
    queue.getJob.mockResolvedValue(undefined);
    await expect(svc.enqueuePublish('p1', 'u1', 't1', 'publish')).resolves.toEqual({ postId: 'p1', jobState: 'waiting' });
    expect(queue.add).toHaveBeenCalledWith('publish-post',
      { postId: 'p1', userId: 'u1', tenantId: 't1', mode: 'publish' },
      expect.objectContaining({ jobId: 'publish-post-p1', delay: 0, attempts: 1, removeOnComplete: true }));
  });

  it.each(['failed', 'completed', 'delayed'])('removes an old %s job first', async (state) => {
    const old = { getState: async () => state, remove: jest.fn() };
    queue.getJob.mockResolvedValue(old);
    await svc.enqueuePublish('p1', 'u1', 't1', 'publish');
    expect(old.remove).toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalled();
    expect(old.remove.mock.invocationCallOrder[0]).toBeLessThan(queue.add.mock.invocationCallOrder[0]);
  });

  it.each([PostStatus.DRAFT, PostStatus.SCHEDULED])('rejects a retry of a %s post without touching the queue', async (status) => {
    jest.spyOn(svc, 'getPost').mockResolvedValue({ id: 'p1', status } as any);
    const old = { getState: async () => 'delayed', remove: jest.fn() };
    queue.getJob.mockResolvedValue(old);
    await expect(svc.enqueuePublish('p1', 'u1', 't1', 'retry')).rejects.toThrow('Can only retry failed or partially published posts');
    expect(old.remove).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it.each(['waiting', 'active'])('rejects a second publish while the job is %s', async (state) => {
    queue.getJob.mockResolvedValue({ getState: async () => state, remove: jest.fn() });
    await expect(svc.enqueuePublish('p1', 'u1', 't1', 'publish')).rejects.toThrow('A publish for this post is already in progress.');
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('rejects a publish of a published post', async () => {
    jest.spyOn(svc, 'getPost').mockResolvedValue({ id: 'p1', status: PostStatus.PUBLISHED } as any);
    await expect(svc.enqueuePublish('p1', 'u1', 't1', 'publish')).rejects.toThrow('Post already published');
  });

  const livePost = (status: PostStatus) => ({
    id: 'p1',
    status,
    targetPlatforms: ['x', 'tiktok'],
    publishedPosts: [{ platform: 'x', publishStatus: 'PUBLISH_COMPLETE' }],
  });

  it('rejects a publish of a FAILED post that is live on some platforms', async () => {
    jest.spyOn(svc, 'getPost').mockResolvedValue(livePost(PostStatus.FAILED) as any);
    await expect(svc.enqueuePublish('p1', 'u1', 't1', 'publish')).rejects.toThrow(
      'This post is live on some platforms. Call retry_publish_post to publish to the other platforms.');
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('publishes a DRAFT post with no published posts', async () => {
    jest.spyOn(svc, 'getPost').mockResolvedValue({ id: 'p1', status: PostStatus.DRAFT, publishedPosts: [] } as any);
    queue.getJob.mockResolvedValue(undefined);
    await expect(svc.enqueuePublish('p1', 'u1', 't1', 'publish')).resolves.toEqual({ postId: 'p1', jobState: 'waiting' });
  });

  it('allows a retry of a DRAFT post that is live on some platforms', async () => {
    jest.spyOn(svc, 'getPost').mockResolvedValue(livePost(PostStatus.DRAFT) as any);
    queue.getJob.mockResolvedValue(undefined);
    await expect(svc.enqueuePublish('p1', 'u1', 't1', 'retry')).resolves.toEqual({ postId: 'p1', jobState: 'waiting' });
  });

  it('retries a DRAFT live post only on the platforms that are not live', async () => {
    const post = { ...livePost(PostStatus.DRAFT), failureReasons: undefined };
    jest.spyOn(svc, 'getPost').mockResolvedValue(post as any);
    publishedPostRepository.find.mockResolvedValue(post.publishedPosts);
    const publish = jest.spyOn(svc, 'publishPost').mockImplementation(async () => {
      expect(post.targetPlatforms).toEqual(['tiktok']);
      return { ...post } as any;
    });
    const result = await svc.retryPublishPost('p1', 'u1', 't1');
    expect(publish).toHaveBeenCalledTimes(1);
    expect(result.targetPlatforms).toEqual(['x', 'tiktok']);
  });

  it('maps the job state', async () => {
    queue.getJob.mockResolvedValue(undefined);
    await expect(svc.getPublishJobState('p1')).resolves.toBe('none');
    queue.getJob.mockResolvedValue({ getState: async () => 'failed' });
    await expect(svc.getPublishJobState('p1')).resolves.toBe('none');
    queue.getJob.mockResolvedValue({ getState: async () => 'active' });
    await expect(svc.getPublishJobState('p1')).resolves.toBe('active');
  });

  it('filters getUserPosts by status only when it is set', async () => {
    await svc.getUserPosts('u1', 't1', 10, 0, PostStatus.FAILED);
    expect(postRepository.find.mock.calls[0][0].where).toEqual({ tenantId: 't1', status: PostStatus.FAILED });
    await svc.getUserPosts('u1', 't1');
    expect(postRepository.find.mock.calls[1][0].where).toEqual({ tenantId: 't1' });
  });
});
