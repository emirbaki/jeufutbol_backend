// This spec loads code that imports the ESM-only uuid package.
jest.mock('uuid', () => ({ v4: () => require('crypto').randomUUID() }));

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { McpUploadController } from './mcp-upload.controller';
import { UploadTokenService } from './upload-token.service';
import { UploadService } from '../upload/upload.service';

const UUID = '3f2b8c1e-4d5a-4b6c-8e7f-9a0b1c2d3e4f';
const OTHER_UUID = '3f2b8c1e-4d5a-4b6c-8e7f-000000000000';

describe('McpUploadController', () => {
  let app: INestApplication;
  const tokens = new UploadTokenService(new JwtService({ secret: 's' }), { get: () => 's' } as any);
  const upload = { saveChunk: jest.fn() };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      controllers: [McpUploadController],
      providers: [
        { provide: UploadTokenService, useValue: tokens },
        { provide: UploadService, useValue: upload },
      ],
    }).compile();
    app = mod.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => upload.saveChunk.mockReset());

  it('saves a chunk with the tenant from the token', async () => {
    upload.saveChunk.mockResolvedValue({ received: true, chunkIndex: 1 });
    const { token } = tokens.sign(UUID, 't1');
    const r = await request(app.getHttpServer())
      .post(`/mcp/uploads/${UUID}/chunks/1`)
      .set('X-Upload-Token', token)
      .attach('chunk', Buffer.from('abc'), 'part');
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ received: true, chunkIndex: 1 });
    expect(upload.saveChunk).toHaveBeenCalledWith(UUID, 1, Buffer.from('abc'), 't1');
  });

  it('rejects a request with no token', async () => {
    const r = await request(app.getHttpServer())
      .post(`/mcp/uploads/${UUID}/chunks/0`)
      .attach('chunk', Buffer.from('abc'), 'part');
    expect(r.status).toBe(401);
    expect(upload.saveChunk).not.toHaveBeenCalled();
  });

  it('rejects a token for another upload', async () => {
    const { token } = tokens.sign(OTHER_UUID, 't1');
    const r = await request(app.getHttpServer())
      .post(`/mcp/uploads/${UUID}/chunks/0`)
      .set('X-Upload-Token', token)
      .attach('chunk', Buffer.from('abc'), 'part');
    expect(r.status).toBe(401);
    expect(upload.saveChunk).not.toHaveBeenCalled();
  });

  it('rejects a bad token in the guard, before multer reads the body', async () => {
    // A broken multipart body gives a multer error if the body is read. A 401 shows that the guard ran first.
    const r = await request(app.getHttpServer())
      .post(`/mcp/uploads/${UUID}/chunks/0`)
      .set('X-Upload-Token', 'not-a-token')
      .set('Content-Type', 'multipart/form-data; boundary=xyz')
      .send('--xyz\r\nbroken');
    expect(r.status).toBe(401);
    expect(r.body.message).toBe('Upload token is not valid. Call create_upload again.');
    expect(upload.saveChunk).not.toHaveBeenCalled();
  });

  it('rejects a chunk larger than the chunk size', async () => {
    const { token } = tokens.sign(UUID, 't1');
    const r = await request(app.getHttpServer())
      .post(`/mcp/uploads/${UUID}/chunks/0`)
      .set('X-Upload-Token', token)
      .attach('chunk', Buffer.alloc(52428801), 'part');
    expect(r.status).toBe(400);
    expect(r.body.message).toBe('Chunk is larger than 52428800 bytes.');
    expect(upload.saveChunk).not.toHaveBeenCalled();
  });

  it('asks for the chunk field when it is missing', async () => {
    const { token } = tokens.sign(UUID, 't1');
    const r = await request(app.getHttpServer())
      .post(`/mcp/uploads/${UUID}/chunks/0`)
      .set('X-Upload-Token', token)
      .field('other', 'x');
    expect(r.status).toBe(400);
    expect(r.body.message).toBe('The chunk field is missing. Send the file as -F chunk=@<file>.');
  });
});
