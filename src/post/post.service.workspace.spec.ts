jest.mock('uuid', () => ({ v4: () => require('crypto').randomUUID() }));

import { Test } from '@nestjs/testing';
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
import { WorkspacesService } from '../workspaces/workspaces.service';
import { PlatformType } from '../enums/platform-type.enum';

describe('PostsService workspaces', () => {
  let svc: PostsService;
  let postRepository: { create: jest.Mock; save: jest.Mock; findOne: jest.Mock };
  let credentials: { pickPublishCredential: jest.Mock; getAccessToken: jest.Mock; listCredentials: jest.Mock };
  let workspaces: { resolve: jest.Mock };
  let tiktok: { getCreatorInfo: jest.Mock };

  beforeEach(async () => {
    postRepository = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 'p1', ...x })),
      findOne: jest.fn(),
    };
    credentials = { pickPublishCredential: jest.fn(), getAccessToken: jest.fn(), listCredentials: jest.fn() };
    workspaces = { resolve: jest.fn().mockResolvedValue({ id: 'w1', slug: 'general' }) };
    tiktok = { getCreatorInfo: jest.fn().mockResolvedValue({}) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        PostsService,
        { provide: getRepositoryToken(Post), useValue: postRepository },
        { provide: getRepositoryToken(PublishedPost), useValue: {} },
        { provide: getQueueToken(QUEUE_NAMES.ASYNC_POST_POLLING), useValue: {} },
        { provide: getQueueToken(QUEUE_NAMES.SCHEDULED_POSTS), useValue: { getJob: jest.fn(), add: jest.fn() } },
        { provide: 'PUB_SUB', useValue: { publish: jest.fn() } },
        { provide: PostGatewayFactory, useValue: {} },
        { provide: CredentialsService, useValue: credentials },
        { provide: UploadService, useValue: {} },
        { provide: TiktokPostGateway, useValue: tiktok },
        { provide: WorkspacesService, useValue: workspaces },
      ],
    }).compile();
    svc = moduleRef.get(PostsService);
  });

  const input = (extra: object = {}) => ({ content: 'hi', targetPlatforms: ['x'], scheduledFor: null, ...extra }) as any;

  it('createPost stores the resolved workspace id', async () => {
    workspaces.resolve.mockResolvedValue({ id: 'w2', slug: 'football' });
    await svc.createPost('u1', 't1', input({ workspaceId: 'football' }));
    expect(workspaces.resolve).toHaveBeenCalledWith('t1', 'football');
    expect(postRepository.save).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'w2', tenantId: 't1' }));
  });

  it('createPost without a workspace uses resolve with undefined', async () => {
    await svc.createPost('u1', 't1', input());
    expect(workspaces.resolve).toHaveBeenCalledWith('t1', undefined);
  });

  it('updatePost resolves the workspace reference', async () => {
    jest
      .spyOn(svc, 'getPost')
      .mockResolvedValue({ id: 'p1', status: PostStatus.DRAFT, tenantId: 't1', workspaceId: 'w1' } as any);
    workspaces.resolve.mockResolvedValue({ id: 'w3', slug: 'cinema' });
    await svc.updatePost('p1', 'u1', 't1', { workspaceId: 'cinema' });
    expect(workspaces.resolve).toHaveBeenCalledWith('t1', 'cinema');
    const saved = postRepository.save.mock.calls[0][0];
    expect(saved.workspaceId).toBe('w3');
  });

  it('updatePost without a workspace keeps the old one', async () => {
    jest
      .spyOn(svc, 'getPost')
      .mockResolvedValue({ id: 'p1', status: PostStatus.DRAFT, tenantId: 't1', workspaceId: 'w1' } as any);
    await svc.updatePost('p1', 'u1', 't1', { content: 'new' });
    expect(workspaces.resolve).not.toHaveBeenCalled();
    expect(postRepository.save.mock.calls[0][0].workspaceId).toBe('w1');
  });

  it('getPost does not filter by user', async () => {
    postRepository.findOne.mockResolvedValue({ id: 'p1' });
    await svc.getPost('p1', 'u1', 't1');
    expect(postRepository.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'p1', tenantId: 't1' } }));
  });

  it('getPublishAccess uses the post workspace', async () => {
    const post = { tenantId: 't1', workspaceId: 'w2', workspace: { id: 'w2', slug: 'football' } } as any;
    credentials.pickPublishCredential.mockResolvedValue({ id: 'c9' });
    credentials.getAccessToken.mockResolvedValue('tok');
    await expect(svc.getPublishAccess(post, PlatformType.X)).resolves.toEqual({
      credential: { id: 'c9' },
      accessToken: 'tok',
    });
    expect(workspaces.resolve).not.toHaveBeenCalled();
    expect(credentials.pickPublishCredential).toHaveBeenCalledWith('t1', post.workspace, 'x');
    expect(credentials.getAccessToken).toHaveBeenCalledWith('c9', 't1');
  });

  it('getPublishAccess uses the default workspace for a post without workspaceId', async () => {
    credentials.pickPublishCredential.mockResolvedValue({ id: 'c9' });
    await svc.getPublishAccess({ tenantId: 't1', workspaceId: null } as any, PlatformType.X);
    expect(workspaces.resolve).toHaveBeenCalledWith('t1', null);
    expect(credentials.pickPublishCredential).toHaveBeenCalledWith('t1', { id: 'w1', slug: 'general' }, 'x');
  });

  it('getTikTokCreatorInfo uses the workspace', async () => {
    workspaces.resolve.mockResolvedValue({ id: 'w2', slug: 'football' });
    credentials.pickPublishCredential.mockResolvedValue({ id: 'c7' });
    credentials.getAccessToken.mockResolvedValue('tok');
    await svc.getTikTokCreatorInfo('u1', 't1', 'football');
    expect(workspaces.resolve).toHaveBeenCalledWith('t1', 'football');
    expect(credentials.pickPublishCredential).toHaveBeenCalledWith('t1', { id: 'w2', slug: 'football' }, 'tiktok');
    expect(tiktok.getCreatorInfo).toHaveBeenCalledWith('tok');
  });
});
