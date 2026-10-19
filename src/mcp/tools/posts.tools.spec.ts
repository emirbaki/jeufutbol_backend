// PostsService imports code that imports the ESM-only uuid package.
jest.mock('uuid', () => ({ v4: () => require('crypto').randomUUID() }));

import { PostToolsGroup } from './posts.tools';
import { McpAuthContext } from '../mcp-auth.context';

const UUID = '3f2b8c1e-4d5a-4b6c-8e7f-9a0b1c2d3e4f';
const ctx: McpAuthContext = {
  userId: 'u1',
  tenantId: 't1',
  grant: { isUser: false, scopes: [] },
  keyPrefix: 'jeu_ab',
  apiBaseUrl: 'https://x/api',
  access: 'all',
};
const validYoutubeArgs = {
  content: 'Hi',
  targetPlatforms: ['youtube'],
  mediaUrls: ['https://cdn/x.mp4'],
  youtubeSettings: { title: 'T', privacy_status: 'public' },
};
const postRow = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  status: 'draft',
  content: 'Hi',
  targetPlatforms: ['youtube'],
  mediaUrls: ['https://cdn/x.mp4'],
  scheduledFor: null,
  failureReasons: null,
  publishedPosts: [],
  ...over,
});

describe('PostToolsGroup', () => {
  let creds: { listCredentials: jest.Mock };
  let posts: Record<string, jest.Mock>;
  let workspaces: { resolve: jest.Mock };
  let group: PostToolsGroup;
  const tool = (name: string) => group.tools().find((t) => t.name === name)!;

  beforeEach(() => {
    creds = { listCredentials: jest.fn() };
    posts = {
      createPost: jest.fn(),
      updatePost: jest.fn(),
      getPost: jest.fn(),
      getUserPosts: jest.fn(),
      deletePost: jest.fn(),
      enqueuePublish: jest.fn(),
      getPublishJobState: jest.fn(),
    };
    workspaces = { resolve: jest.fn().mockResolvedValue({ id: 'w1', slug: 'general' }) };
    group = new PostToolsGroup(posts as any, creds as any, workspaces as any);
  });

  it('create_post rejects a platform with no account', async () => {
    creds.listCredentials.mockResolvedValue([]);
    await expect(tool('create_post').handler(validYoutubeArgs, ctx)).rejects.toThrow(
      'No youtube account is connected in workspace "general". Connect it in JeuHub Settings, or call list_connected_accounts to see the accounts of each workspace.',
    );
    expect(creds.listCredentials).toHaveBeenCalledWith('t1', { workspaceId: 'w1', platform: 'youtube' });
    expect(posts.createPost).not.toHaveBeenCalled();
  });

  it('create_post passes a Date for scheduledFor', async () => {
    creds.listCredentials.mockResolvedValue([{ id: 'c1' }]);
    posts.createPost.mockResolvedValue(postRow({ status: 'scheduled', scheduledFor: new Date('2099-01-01T07:00:00Z') }));
    const out: any = await tool('create_post').handler(
      { ...validYoutubeArgs, scheduledFor: '2099-01-01T10:00:00+03:00' },
      ctx,
    );
    expect(posts.createPost).toHaveBeenCalledWith(
      'u1',
      't1',
      expect.objectContaining({ scheduledFor: new Date('2099-01-01T07:00:00Z') }),
    );
    expect(out.next).toBe('The post is scheduled. Call get_post to check it later.');
  });

  it('create_post with no date says to publish', async () => {
    creds.listCredentials.mockResolvedValue([{ id: 'c1' }]);
    posts.createPost.mockResolvedValue(postRow());
    const out: any = await tool('create_post').handler(validYoutubeArgs, ctx);
    expect(posts.createPost).toHaveBeenCalledWith('u1', 't1', expect.objectContaining({ scheduledFor: null }));
    expect(out).toMatchObject({ postId: 'p1', status: 'draft', next: 'Call publish_post with this postId.' });
  });

  it('update_post checks the new platforms, then updates', async () => {
    creds.listCredentials.mockResolvedValue([{ id: 'c1' }]);
    posts.getPost.mockResolvedValue(postRow({ workspace: { id: 'w1', slug: 'general' } }));
    posts.updatePost.mockResolvedValue(postRow());
    const out: any = await tool('update_post').handler({ postId: UUID, targetPlatforms: ['x'], content: 'New' }, ctx);
    expect(creds.listCredentials).toHaveBeenCalledWith('t1', { workspaceId: 'w1', platform: 'x' });
    expect(posts.updatePost).toHaveBeenCalledWith(UUID, 'u1', 't1', { targetPlatforms: ['x'], content: 'New' });
    expect(out.next).toBe('Call publish_post with this postId.');
  });

  it('publish_post queues the publish', async () => {
    posts.getPost.mockResolvedValue(postRow());
    posts.enqueuePublish.mockResolvedValue({ postId: 'p1', jobState: 'waiting' });
    const out: any = await tool('publish_post').handler({ postId: UUID }, ctx);
    expect(posts.enqueuePublish).toHaveBeenCalledWith(UUID, 'u1', 't1', 'publish');
    expect(out.next).toBe('Call get_post until status is published or failed.');
  });

  it('retry_publish_post uses mode retry', async () => {
    posts.getPost.mockResolvedValue(postRow());
    posts.enqueuePublish.mockResolvedValue({ postId: 'p1', jobState: 'waiting' });
    const out: any = await tool('retry_publish_post').handler({ postId: UUID }, ctx);
    expect(posts.enqueuePublish).toHaveBeenCalledWith(UUID, 'u1', 't1', 'retry');
    expect(out.next).toBe('Call get_post until status is published or failed.');
  });

  it('get_post gives the summary with the job state and the platform URLs', async () => {
    posts.getPost.mockResolvedValue(
      postRow({
        status: 'failed',
        failureReasons: { tiktok: 'Token expired' },
        publishedPosts: [{ platform: 'youtube', platformPostUrl: 'https://youtu.be/x', publishStatus: 'PUBLISHED' }],
      }),
    );
    posts.getPublishJobState.mockResolvedValue('none');
    const out: any = await tool('get_post').handler({ postId: UUID }, ctx);
    expect(posts.getPost).toHaveBeenCalledWith(UUID, 'u1', 't1');
    expect(out).toMatchObject({
      status: 'failed',
      jobState: 'none',
      failureReasons: { tiktok: 'Token expired' },
      publishedPosts: [{ platform: 'youtube', url: 'https://youtu.be/x', status: 'PUBLISHED' }],
    });
    expect(out.next).toBe('Some platforms failed. Fix the cause in failureReasons, then call retry_publish_post.');
  });

  it('get_post says to wait while the job runs', async () => {
    posts.getPost.mockResolvedValue(postRow());
    posts.getPublishJobState.mockResolvedValue('active');
    const out: any = await tool('get_post').handler({ postId: UUID }, ctx);
    expect(out.next).toBe('The publish is in progress. Call get_post again in 30 seconds.');
  });

  it('list_posts passes the status filter', async () => {
    posts.getUserPosts.mockResolvedValue([]);
    await tool('list_posts').handler({ limit: 10, offset: 0, status: 'scheduled' }, ctx);
    expect(posts.getUserPosts).toHaveBeenCalledWith('u1', 't1', 10, 0, 'scheduled', undefined);
  });

  it('create_post checks accounts inside the workspace', async () => {
    workspaces.resolve.mockResolvedValue({ id: 'w2', slug: 'football' });
    creds.listCredentials.mockResolvedValue([]);
    await expect(tool('create_post').handler({ ...validYoutubeArgs, workspace: 'football' }, ctx)).rejects.toThrow(
      'No youtube account is connected in workspace "football".',
    );
    expect(workspaces.resolve).toHaveBeenCalledWith('t1', 'football');
    expect(posts.createPost).not.toHaveBeenCalled();
  });

  it('create_post passes the resolved id and not the slug', async () => {
    workspaces.resolve.mockResolvedValue({ id: 'w2', slug: 'football' });
    creds.listCredentials.mockResolvedValue([{ id: 'c1' }]);
    posts.createPost.mockResolvedValue(postRow());
    const out: any = await tool('create_post').handler({ ...validYoutubeArgs, workspace: 'football' }, ctx);
    const input = posts.createPost.mock.calls[0][2];
    expect(input.workspaceId).toBe('w2');
    expect(input).not.toHaveProperty('workspace');
    expect(out.workspace).toBe('football');
  });

  it('update_post with only workspace checks the current platforms', async () => {
    workspaces.resolve.mockResolvedValue({ id: 'w2', slug: 'football' });
    creds.listCredentials.mockResolvedValue([{ id: 'c1' }]);
    posts.getPost.mockResolvedValue(postRow({ targetPlatforms: ['x'], workspace: { id: 'w1', slug: 'general' } }));
    posts.updatePost.mockResolvedValue(postRow());
    const out: any = await tool('update_post').handler({ postId: UUID, workspace: 'football' }, ctx);
    expect(creds.listCredentials).toHaveBeenCalledWith('t1', { workspaceId: 'w2', platform: 'x' });
    expect(posts.updatePost).toHaveBeenCalledWith(UUID, 'u1', 't1', { workspaceId: 'w2' });
    expect(out.workspace).toBe('football');
  });

  it('update_post with no platform or workspace change does not check accounts', async () => {
    posts.updatePost.mockResolvedValue(postRow());
    await tool('update_post').handler({ postId: UUID, content: 'New' }, ctx);
    expect(posts.getPost).not.toHaveBeenCalled();
    expect(creds.listCredentials).not.toHaveBeenCalled();
  });

  it('list_posts filters by workspace and shows it', async () => {
    workspaces.resolve.mockResolvedValue({ id: 'w2', slug: 'football' });
    posts.getUserPosts.mockResolvedValue([postRow({ workspace: { slug: 'football' } })]);
    const out: any = await tool('list_posts').handler({ limit: 20, offset: 0, workspace: 'football' }, ctx);
    expect(posts.getUserPosts).toHaveBeenCalledWith('u1', 't1', 20, 0, undefined, 'w2');
    expect(out.posts[0].workspace).toBe('football');
  });

  it('list_posts has the default limit and offset', () => {
    expect(tool('list_posts').inputSchema.parse({})).toEqual({ limit: 20, offset: 0 });
    expect(tool('list_posts').inputSchema.safeParse({ limit: 101 }).success).toBe(false);
  });

  it('delete_post deletes the post', async () => {
    posts.getPost.mockResolvedValue(postRow());
    posts.deletePost.mockResolvedValue(true);
    await expect(tool('delete_post').handler({ postId: UUID }, ctx)).resolves.toEqual({ deleted: true });
    expect(posts.deletePost).toHaveBeenCalledWith(UUID, 'u1', 't1');
  });

  it('has the correct scopes', () => {
    expect(tool('delete_post').scopes).toEqual(['posts:delete']);
    expect(tool('get_post').scopes).toEqual(['posts:read']);
    expect(tool('list_posts').scopes).toEqual(['posts:read']);
    for (const name of ['create_post', 'update_post', 'publish_post', 'retry_publish_post']) {
      expect(tool(name).scopes).toEqual(['posts:write']);
    }
  });
});
