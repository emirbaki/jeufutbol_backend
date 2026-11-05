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

describe('PostsResolver deletePosts', () => {
  let posts: Record<string, jest.Mock>;
  let access: { accessFor: jest.Mock; assertRow: jest.Mock };
  let resolver: PostsResolver;

  beforeEach(() => {
    posts = {
      getPost: jest.fn().mockImplementation(async (id: string) => ({ id, workspaceId: `w-${id}` })),
      deletePost: jest.fn().mockResolvedValue(true),
    };
    access = { accessFor: jest.fn().mockResolvedValue('all'), assertRow: jest.fn() };
    resolver = new PostsResolver(
      posts as any,
      { publish: jest.fn() } as any,
      { resolve: jest.fn() } as any,
      access as any,
    );
  });

  it('deletes each post once and returns the deleted ids', async () => {
    const result = await resolver.deletePosts(user, undefined as any, ['p1', 'p2', 'p1']);

    expect(result).toEqual({ deletedIds: ['p1', 'p2'], failedIds: [] });
    expect(posts.deletePost).toHaveBeenCalledTimes(2);
    expect(posts.deletePost).toHaveBeenCalledWith('p1', 'u1', 't1');
    expect(posts.deletePost).toHaveBeenCalledWith('p2', 'u1', 't1');
  });

  it('continues after a failed delete and returns the failed id', async () => {
    posts.deletePost.mockRejectedValueOnce(new Error('storage error'));

    const result = await resolver.deletePosts(user, undefined as any, ['p1', 'p2']);

    expect(result).toEqual({ deletedIds: ['p2'], failedIds: ['p1'] });
  });

  it('does not delete a post in a workspace that the caller cannot reach', async () => {
    access.assertRow.mockImplementation((_access: unknown, workspaceId: string) => {
      if (workspaceId === 'w-p1') throw new Error('Post not found');
    });

    const result = await resolver.deletePosts(user, undefined as any, ['p1', 'p2']);

    expect(result).toEqual({ deletedIds: ['p2'], failedIds: ['p1'] });
    expect(posts.deletePost).not.toHaveBeenCalledWith('p1', 'u1', 't1');
  });

  it('rejects a request with more than 100 posts', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `p${i}`);

    await expect(resolver.deletePosts(user, undefined as any, ids)).rejects.toThrow('100');
    expect(posts.deletePost).not.toHaveBeenCalled();
  });
});
