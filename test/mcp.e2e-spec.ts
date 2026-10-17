// uuid and @xenova/transformers are ESM-only. Jest cannot load them.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('uuid', () => ({ v4: () => require('crypto').randomUUID() }));
jest.mock('../src/insights/ai-insights.service', () => ({
  AIInsightsService: class {},
}));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AddressInfo } from 'net';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { MCP_CONTROLLERS, MCP_PROVIDERS } from '../src/mcp/mcp.providers';
import { CombinedAuthGuard } from '../src/auth/guards/combined-auth.guard';
import { UploadService } from '../src/upload/upload.service';
import { PostsService } from '../src/post/post.service';
import { CredentialsService } from '../src/credentials/credential.service';
import { AIInsightsService } from '../src/insights/ai-insights.service';
import { JobService } from '../src/queue/job.service';
import { QUEUE_NAMES } from '../src/queue/queue.config';

const POST_ID = '3f2b8c1e-7a4d-4e9b-9c2a-1d5e6f7a8b9c';
const UUID = '9b1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f';

const postRow = (over: Record<string, unknown> = {}) => ({
  id: POST_ID,
  status: 'draft',
  content: 'Hi',
  targetPlatforms: ['youtube'],
  mediaUrls: [],
  scheduledFor: null,
  failureReasons: null,
  publishedPosts: [],
  ...over,
});

const parse = (r: any) => JSON.parse(r.content[0].text);

describe('MCP endpoint (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let client: Client;
  let uploadDir: string;
  const posts: Record<string, jest.Mock> = {
    createPost: jest.fn(),
    enqueuePublish: jest.fn(),
    getPost: jest.fn(),
    getPublishJobState: jest.fn(),
  };
  const credentials = { getUserCredentials: jest.fn() };

  beforeAll(async () => {
    uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-e2e-'));
    process.env.UPLOAD_DIR = uploadDir;
    process.env.JWT_SECRET = 'test';

    const mod = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test' })],
      controllers: MCP_CONTROLLERS,
      providers: [
        ...MCP_PROVIDERS,
        UploadService,
        {
          provide: ConfigService,
          useValue: { get: (key: string) => process.env[key] },
        },
        { provide: PostsService, useValue: posts },
        { provide: CredentialsService, useValue: credentials },
        { provide: AIInsightsService, useValue: {} },
        { provide: JobService, useValue: {} },
        {
          provide: getQueueToken(QUEUE_NAMES.MEDIA_IMPORT),
          useValue: { add: jest.fn() },
        },
      ],
    })
      .overrideGuard(CombinedAuthGuard)
      .useValue({
        canActivate: (c: any) => {
          c.switchToHttp().getRequest().apiKey = {
            createdByUserId: 'u1',
            tenantId: 't1',
            scopes: ['posts:read', 'posts:write'],
            keyPrefix: 'jeu_t',
          };
          return true;
        },
      })
      .compile();

    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    server = app.getHttpServer();
    const port = (server.address() as AddressInfo).port;
    process.env.PUBLIC_API_URL = `http://127.0.0.1:${port}/api`;

    client = new Client({ name: 'e2e', version: '1' });
    await client.connect(
      new StreamableHTTPClientTransport(
        new URL(`http://127.0.0.1:${port}/api/mcp`),
      ),
    );
  });

  afterAll(async () => {
    await client.close();
    await app.close();
    fs.rmSync(uploadDir, { recursive: true, force: true });
  });

  it('lists the tools for the key scopes', async () => {
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'create_upload',
        'create_post',
        'publish_post',
        'get_post',
        'get_job',
      ]),
    );
    expect(names).not.toContain('delete_post');
    expect(names).not.toContain('generate_post_text');
  });

  it('uploads 2 chunks, creates a draft and publishes it', async () => {
    const up = parse(
      await client.callTool({
        name: 'create_upload',
        arguments: {
          filename: 'v.mp4',
          sizeBytes: 52428801,
          mimeType: 'video/mp4',
        },
      }),
    );
    expect(up.totalChunks).toBe(2);
    for (const [i, size] of [
      [0, 52428800],
      [1, 1],
    ]) {
      await request(server)
        .post(`/api/mcp/uploads/${up.uploadId}/chunks/${i}`)
        .set('X-Upload-Token', up.uploadToken)
        .attach('chunk', Buffer.alloc(size), 'part')
        .expect(201);
    }
    const done = parse(
      await client.callTool({
        name: 'complete_upload',
        arguments: { uploadId: up.uploadId },
      }),
    );
    expect(done.size).toBe(52428801);

    credentials.getUserCredentials.mockResolvedValue([{ id: 'c1' }]);
    posts.createPost.mockResolvedValue(postRow({ mediaUrls: [done.mediaUrl] }));
    const post = parse(
      await client.callTool({
        name: 'create_post',
        arguments: {
          content: 'Hi',
          targetPlatforms: ['youtube'],
          mediaUrls: [done.mediaUrl],
          youtubeSettings: { title: 'T' },
        },
      }),
    );
    posts.enqueuePublish.mockResolvedValue({
      postId: post.postId,
      jobState: 'waiting',
    });
    await client.callTool({
      name: 'publish_post',
      arguments: { postId: post.postId },
    });
    posts.getPost.mockResolvedValue(postRow({ status: 'draft' }));
    posts.getPublishJobState.mockResolvedValue('waiting');
    expect(
      parse(
        await client.callTool({
          name: 'get_post',
          arguments: { postId: post.postId },
        }),
      ).jobState,
    ).toBe('waiting');
  });

  it('rejects a chunk with a bad token', async () => {
    await request(server)
      .post(`/api/mcp/uploads/${UUID}/chunks/0`)
      .set('X-Upload-Token', 'bad')
      .attach('chunk', Buffer.alloc(1), 'part')
      .expect(401);
  });

  it('returns 405 for GET', () => request(server).get('/api/mcp').expect(405));
});
