jest.mock('uuid', () => ({ v4: () => require('crypto').randomUUID() }));
import { FindOperator } from 'typeorm';
import { DataQueryTools, DataScope } from './data-query.tool';
import { Post } from '../../entities/post.entity';
import { Insight } from '../../entities/insight.entity';
import { MonitoredProfile } from '../../entities/monitored-profile.entity';
import { TweetMonitoredProfile } from '../../entities/tweet-monitored-profile.entity';

/** Applies a TypeORM where object to a row, for the operators the tools use. */
function matches(row: any, where: any): boolean {
  return Object.entries(where ?? {}).every(([key, cond]) => {
    if (cond === undefined) return true;
    const value = row?.[key];
    if (cond instanceof FindOperator) {
      const v: any = (cond as any).value;
      switch (cond.type) {
        case 'in':
          return v.includes(value);
        case 'ilike':
          return String(value ?? '')
            .toLowerCase()
            .includes(String(v).replace(/%/g, '').toLowerCase());
        case 'between':
          return value >= v[0] && value <= v[1];
        case 'moreThanOrEqual':
          return value >= v;
        case 'lessThanOrEqual':
          return value <= v;
        default:
          throw new Error(`Operator ${cond.type} is not in the fake`);
      }
    }
    if (cond && typeof cond === 'object' && !(cond instanceof Date))
      return matches(value, cond);
    return value === cond;
  });
}

function fakeRepo(rows: any[]) {
  const filter = (opts: any) => rows.filter((r) => matches(r, opts?.where));
  return {
    find: jest.fn(async (opts: any) =>
      filter(opts).slice(0, opts?.take ?? rows.length),
    ),
    count: jest.fn(async (opts: any) => filter(opts).length),
  };
}

describe('DataQueryTools', () => {
  const day = (d: number) => new Date(Date.UTC(2026, 0, d));
  const posts = [
    {
      id: 'p-own',
      tenantId: 't1',
      workspaceId: 'w1',
      content: 'Own branch',
      status: 'draft',
      createdAt: day(1),
    },
    {
      id: 'p-other-branch',
      tenantId: 't1',
      workspaceId: 'w2',
      content: 'Other branch',
      status: 'draft',
      createdAt: day(2),
    },
    {
      id: 'p-other-tenant',
      tenantId: 't2',
      workspaceId: 'w1',
      content: 'Other tenant',
      status: 'draft',
      createdAt: day(3),
    },
    {
      id: 'p-no-branch',
      tenantId: 't1',
      workspaceId: null,
      content: 'No branch',
      status: 'draft',
      createdAt: day(4),
    },
  ];
  const insights = [
    {
      id: 'i-own',
      tenantId: 't1',
      workspaceId: 'w1',
      title: 'Own',
      createdAt: day(1),
    },
    {
      id: 'i-other',
      tenantId: 't1',
      workspaceId: 'w2',
      title: 'Other',
      createdAt: day(2),
    },
  ];
  const profiles = [
    { id: 'm-own', tenantId: 't1', workspaceId: 'w1', xUsername: 'own' },
    { id: 'm-other', tenantId: 't1', workspaceId: 'w2', xUsername: 'other' },
  ];
  const links = [
    {
      monitoredProfileId: 'm-own',
      linkedAt: day(1),
      tweet: { id: 'tw-own', content: 'own tweet' },
    },
    {
      monitoredProfileId: 'm-other',
      linkedAt: day(2),
      tweet: { id: 'tw-other', content: 'other tweet' },
    },
  ];

  let repos: Map<any, ReturnType<typeof fakeRepo>>;
  let dataSource: any;
  const scope: DataScope = { tenantId: 't1', workspaceIds: ['w1'] };

  beforeEach(() => {
    repos = new Map<any, ReturnType<typeof fakeRepo>>([
      [Post, fakeRepo(posts)],
      [Insight, fakeRepo(insights)],
      [MonitoredProfile, fakeRepo(profiles)],
      [TweetMonitoredProfile, fakeRepo(links)],
    ]);
    dataSource = {
      getRepository: jest.fn((e) => repos.get(e)),
      query: jest.fn(),
    };
  });

  const tool = (name: string, s: DataScope = scope) => {
    const found = DataQueryTools.createTools(dataSource, s).find(
      (t) => t.name === name,
    );
    if (!found) throw new Error(`No tool ${name}`);
    return found;
  };
  const ids = (out: string) => JSON.parse(out).map((r: any) => r.id);

  it('has no free SQL tool', () => {
    const names = DataQueryTools.createTools(dataSource, scope).map(
      (t) => t.name,
    );
    expect(names).toEqual([
      'query_posts',
      'count_posts',
      'query_insights',
      'query_monitored_profiles',
      'query_tweets',
    ]);
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('a USER of one branch who asks for the posts of every workspace gets only their branch', async () => {
    const out = await tool('query_posts').invoke({
      workspaceId: 'w2',
      tenantId: 't2',
      limit: 50,
    } as any);
    expect(ids(out)).toEqual(['p-own']);
  });

  it('count_posts counts only the posts of the scope', async () => {
    const out = await tool('count_posts').invoke({});
    expect(JSON.parse(out)).toEqual({ count: 1 });
  });

  it('a search cannot widen the scope', async () => {
    const out = await tool('query_posts').invoke({ search: 'branch' });
    expect(ids(out)).toEqual(['p-own']);
  });

  it('query_insights returns only the insights of the scope', async () => {
    expect(ids(await tool('query_insights').invoke({}))).toEqual(['i-own']);
  });

  it('query_monitored_profiles returns only the profiles of the scope', async () => {
    expect(ids(await tool('query_monitored_profiles').invoke({}))).toEqual([
      'm-own',
    ]);
  });

  it('query_tweets returns only the tweets of profiles in the scope', async () => {
    expect(ids(await tool('query_tweets').invoke({}))).toEqual(['tw-own']);
  });

  it('a scope with no branch returns no rows', async () => {
    const none: DataScope = { tenantId: 't1', workspaceIds: [] };
    expect(JSON.parse(await tool('query_posts', none).invoke({}))).toEqual([]);
    expect(JSON.parse(await tool('count_posts', none).invoke({}))).toEqual({
      count: 0,
    });
    expect(JSON.parse(await tool('query_tweets', none).invoke({}))).toEqual([]);
    expect(repos.get(Post)!.find).not.toHaveBeenCalled();
  });

  it('a scope with two branches returns the rows of both', async () => {
    const out = await tool('query_posts', {
      tenantId: 't1',
      workspaceIds: ['w1', 'w2'],
    }).invoke({});
    expect(ids(out).sort()).toEqual(['p-other-branch', 'p-own']);
  });

  it('the limit is never more than 50', async () => {
    await tool('query_posts').invoke({ limit: 10000 });
    expect(repos.get(Post)!.find).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    );
  });
});
