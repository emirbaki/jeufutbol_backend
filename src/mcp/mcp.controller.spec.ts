// CombinedAuthGuard loads typeorm, which loads the ESM-only uuid package.
jest.mock('uuid', () => ({ v4: () => require('crypto').randomUUID() }));

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { McpController } from './mcp.controller';
import { McpServerFactory } from './mcp-server.factory';
import { CombinedAuthGuard } from '../auth/guards/combined-auth.guard';

describe('McpController', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      controllers: [McpController],
      providers: [
        { provide: McpServerFactory, useValue: { create: jest.fn() } },
        { provide: ConfigService, useValue: { get: () => undefined } },
      ],
    })
      .overrideGuard(CombinedAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = mod.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const body = { jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null };

  it('returns 405 for GET /mcp', async () => {
    const r = await request(app.getHttpServer()).get('/mcp');
    expect(r.status).toBe(405);
    expect(r.body).toEqual(body);
  });

  it('returns 405 for DELETE /mcp', async () => {
    const r = await request(app.getHttpServer()).delete('/mcp');
    expect(r.status).toBe(405);
    expect(r.body).toEqual(body);
  });
});
