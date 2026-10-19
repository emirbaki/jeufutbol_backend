jest.mock('uuid', () => ({ v4: () => require('crypto').randomUUID() }));

import { PostsResolver } from './post.resolver';

const user = { id: 'u1', tenantId: 't1' } as any;
const active = { id: 'w-active', slug: 'football' } as any;

describe('PostsResolver workspaces', () => {
  let posts: Record<string, jest.Mock>;
  let workspaces: { resolve: jest.Mock };
  let resolver: PostsResolver;

  beforeEach(() => {
    posts = {
      createPost: jest.fn().mockResolvedValue({ id: 'p1' }),
      getUserPosts: jest.fn().mockResolvedValue([]),
      listPosts: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      countPostsByStatus: jest.fn().mockResolvedValue({ all: 0 }),
      getTikTokCreatorInfo: jest.fn().mockResolvedValue({}),
    };
    workspaces = { resolve: jest.fn().mockResolvedValue({ id: 'w-explicit' }) };
    resolver = new PostsResolver(
      posts as any,
      { publish: jest.fn() } as any,
      workspaces as any,
      { accessFor: jest.fn().mockResolvedValue('all') } as any,
    );
  });

  it('createPost uses the active workspace when the input has none', async () => {
    await resolver.createPost(user, undefined as any, { content: 'hi', targetPlatforms: ['x'] } as any, active);
    expect(posts.createPost).toHaveBeenCalledWith('u1', 't1', expect.objectContaining({ workspaceId: 'w-active' }));
  });

  it('an explicit workspaceId wins', async () => {
    await resolver.createPost(
      user,
      undefined as any,
      { content: 'hi', targetPlatforms: ['x'], workspaceId: 'cinema' } as any,
      active,
    );
    expect(workspaces.resolve).toHaveBeenCalledWith('t1', 'cinema', 'all');
    expect(posts.createPost).toHaveBeenCalledWith('u1', 't1', expect.objectContaining({ workspaceId: 'w-explicit' }));
  });

  it('getUserPosts uses the active workspace without an argument', async () => {
    await resolver.getUserPosts(user, undefined as any, 10, 0, undefined, active);
    expect(posts.getUserPosts).toHaveBeenCalledWith('u1', 't1', 10, 0, undefined, 'w-active');
  });

  it('postList and postStatusCounts use the active workspace', async () => {
    const filter = { platform: 'x' } as any;
    await expect(resolver.postList(user, undefined as any, filter, active)).resolves.toEqual({ items: [], total: 0 });
    expect(posts.listPosts).toHaveBeenCalledWith('t1', 'w-active', filter);
    await resolver.postStatusCounts(user, undefined as any, filter, active);
    expect(posts.countPostsByStatus).toHaveBeenCalledWith('t1', 'w-active', filter);
  });

  it('getTikTokCreatorInfo uses the active workspace without an argument', async () => {
    await resolver.getTikTokCreatorInfo(user, undefined as any, undefined, active);
    expect(posts.getTikTokCreatorInfo).toHaveBeenCalledWith('u1', 't1', 'w-active');
  });
});
