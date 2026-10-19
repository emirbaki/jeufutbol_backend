jest.mock('uuid', () => ({ v4: () => require('crypto').randomUUID() }));

import { PostsService } from './post.service';
import { PostStatus } from '../entities/post.entity';
import { PostSort } from '../graphql/inputs/post-list.input';

/** A chainable query builder mock that records every call. */
function queryBuilder(result: { many?: [unknown[], number]; raw?: unknown[] }) {
  const calls: Array<[string, unknown[]]> = [];
  const qb: any = new Proxy(
    {},
    {
      get(_t, name: string) {
        if (name === 'getManyAndCount') return async () => result.many ?? [[], 0];
        if (name === 'getRawMany') return async () => result.raw ?? [];
        if (name === 'calls') return calls;
        return (...args: unknown[]) => {
          calls.push([name, args]);
          return qb;
        };
      },
    },
  );
  return qb;
}

const conditions = (qb: any) =>
  qb.calls.filter(([n]: [string]) => n === 'where' || n === 'andWhere').map(([, a]: [string, unknown[]]) => a);

describe('PostsService.listPosts', () => {
  let qb: any;
  let svc: PostsService;

  function build(result: { many?: [unknown[], number]; raw?: unknown[] } = {}) {
    qb = queryBuilder(result);
    const repo = { createQueryBuilder: jest.fn(() => qb) };
    svc = new PostsService(repo as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
  }

  it('filters by tenant and workspace always', async () => {
    build({ many: [[{ id: 'p1' }], 7] });
    await expect(svc.listPosts('t1', 'w1', {})).resolves.toEqual({ items: [{ id: 'p1' }], total: 7 });
    expect(conditions(qb)).toEqual([
      ['post.tenantId = :tenantId', { tenantId: 't1' }],
      ['post.workspaceId = :workspaceId', { workspaceId: 'w1' }],
    ]);
  });

  it('adds status, from and to only when set', async () => {
    build();
    const from = new Date('2026-10-01T00:00:00Z');
    const to = new Date('2026-10-19T00:00:00Z');
    await svc.listPosts('t1', 'w1', { status: PostStatus.FAILED, from, to });
    expect(conditions(qb)).toEqual(
      expect.arrayContaining([
        ['post.status = :status', { status: 'failed' }],
        ['post.createdAt >= :from', { from }],
        ['post.createdAt <= :to', { to }],
      ]),
    );
    expect(conditions(qb)).toHaveLength(5);
  });

  it('platform filter matches whole tokens only', async () => {
    build();
    await svc.listPosts('t1', 'w1', { platform: 'x' });
    expect(conditions(qb)).toContainEqual([`(',' || post."targetPlatforms" || ',') LIKE :platform`, { platform: '%,x,%' }]);
  });

  it('sort OLDEST orders by createdAt ASC, and limit and offset go to take and skip', async () => {
    build();
    await svc.listPosts('t1', 'w1', { sort: PostSort.OLDEST, limit: 10, offset: 30 });
    expect(qb.calls).toContainEqual(['orderBy', ['post.createdAt', 'ASC']]);
    expect(qb.calls).toContainEqual(['take', [10]]);
    expect(qb.calls).toContainEqual(['skip', [30]]);
  });

  it('defaults to NEWEST, 20 and 0', async () => {
    build();
    await svc.listPosts('t1', 'w1', {});
    expect(qb.calls).toContainEqual(['orderBy', ['post.createdAt', 'DESC']]);
    expect(qb.calls).toContainEqual(['take', [20]]);
    expect(qb.calls).toContainEqual(['skip', [0]]);
  });

  it('countPostsByStatus maps the rows and sums all', async () => {
    build({
      raw: [
        { status: 'published', count: '16' },
        { status: 'failed', count: '4' },
      ],
    });
    await expect(svc.countPostsByStatus('t1', 'w1', { platform: 'x' })).resolves.toEqual({
      all: 20,
      published: 16,
      scheduled: 0,
      draft: 0,
      failed: 4,
    });
    expect(qb.calls).toContainEqual(['groupBy', ['post.status']]);
    expect(conditions(qb)).toContainEqual([`(',' || post."targetPlatforms" || ',') LIKE :platform`, { platform: '%,x,%' }]);
  });
});
