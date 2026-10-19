// MediaToolsGroup loads UploadService, which imports the ESM-only uuid package.
jest.mock('uuid', () => ({ v4: () => require('crypto').randomUUID() }));

import { BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MediaToolsGroup } from './media.tools';
import { UploadTokenService } from '../upload-token.service';
import { McpAuthContext } from '../mcp-auth.context';
import { McpToolError } from '../mcp-tool';

const UUID = '3f2b8c1e-4d5a-4b6c-8e7f-9a0b1c2d3e4f';

const ctx: McpAuthContext = {
  userId: 'u1',
  tenantId: 't1',
  grant: { isUser: false, scopes: [] },
  keyPrefix: 'jeu_ab',
  apiBaseUrl: 'https://x/api',
  access: 'all',
};

describe('MediaToolsGroup', () => {
  let upload: { initChunkUpload: jest.Mock; completeChunkUpload: jest.Mock };
  let tokens: UploadTokenService;
  let queue: { add: jest.Mock };
  let group: MediaToolsGroup;
  const tool = (name: string) => group.tools().find((t) => t.name === name)!;

  beforeEach(() => {
    upload = { initChunkUpload: jest.fn(), completeChunkUpload: jest.fn() };
    tokens = new UploadTokenService(new JwtService({ secret: 's' }), { get: () => 's' } as any);
    queue = { add: jest.fn() };
    group = new MediaToolsGroup(upload as any, tokens, queue as any);
  });

  it('create_upload says to run the commands in bash', () => {
    expect(tool('create_upload').description).toBe(
      'Start an upload of a local video or image (300 MB or less). Run the returned commands in bash (Git Bash on Windows), not in PowerShell or cmd. Then call complete_upload. For a file that is already on the web, use import_media_from_url.',
    );
  });

  it('all media tools need posts:write', () => {
    expect(tool('create_upload').scopes).toEqual(['posts:write']);
    expect(tool('complete_upload').scopes).toEqual(['posts:write']);
    expect(tool('import_media_from_url').scopes).toEqual(['posts:write']);
  });

  it('create_upload gives the chunk count and the commands', async () => {
    upload.initChunkUpload.mockResolvedValue('up1');
    const out: any = await tool('create_upload').handler({ filename: 'v.mp4', sizeBytes: 120_000_000, mimeType: 'video/mp4' }, ctx);
    expect(upload.initChunkUpload).toHaveBeenCalledWith('v.mp4', 120_000_000, 3, 'video/mp4', 't1');
    expect(out).toMatchObject({ uploadId: 'up1', chunkSize: 52428800, totalChunks: 3 });
    expect(out.commands[1]).toContain('https://x/api/mcp/uploads/up1/chunks/0');
    expect(out.commands[0]).toContain('jeu_up1_');
    expect(tokens.verify(out.uploadToken, 'up1')).toEqual({ tenantId: 't1' });
    expect(out.expiresAt).toEqual(expect.any(String));
    expect(out.next).toBe(
      'Run the commands in bash (Git Bash on Windows) in the folder of the file. Then call complete_upload with this uploadId.',
    );
  });

  it('create_upload rejects a file over 300 MB and a type that is not video or image', () => {
    const s = tool('create_upload').inputSchema;
    expect(s.safeParse({ filename: 'v.mp4', sizeBytes: 314572801, mimeType: 'video/mp4' }).success).toBe(false);
    expect(s.safeParse({ filename: 'v.zip', sizeBytes: 10, mimeType: 'application/zip' }).success).toBe(false);
    expect(s.safeParse({ filename: 'v.mp4', sizeBytes: 314572800, mimeType: 'video/mp4' }).success).toBe(true);
  });

  it('create_upload rejects a file name with a path separator', () => {
    const s = tool('create_upload').inputSchema;
    expect(s.safeParse({ filename: 'dir/v.mp4', sizeBytes: 10, mimeType: 'video/mp4' }).success).toBe(false);
    expect(s.safeParse({ filename: 'dir\\v.mp4', sizeBytes: 10, mimeType: 'video/mp4' }).success).toBe(false);
    expect(s.safeParse({ filename: '', sizeBytes: 10, mimeType: 'video/mp4' }).success).toBe(false);
  });

  it('create_upload rejects a file name with control characters', () => {
    const s = tool('create_upload').inputSchema;
    for (const filename of ['a\nb.mp4', 'a\rb.mp4', 'a\x00.mp4', 'a\x1f.mp4', 'a\x7f.mp4']) {
      expect(s.safeParse({ filename, sizeBytes: 10, mimeType: 'video/mp4' }).success).toBe(false);
    }
    expect(s.safeParse({ filename: 'my video (1).mp4', sizeBytes: 10, mimeType: 'video/mp4' }).success).toBe(true);
  });

  it('complete_upload adds the next step to a missing chunk error', async () => {
    upload.completeChunkUpload.mockRejectedValue(new BadRequestException('Missing chunks: 2, 4.'));
    await expect(tool('complete_upload').handler({ uploadId: UUID }, ctx)).rejects.toThrow(
      'Missing chunks: 2, 4. Send them again, then call complete_upload.',
    );
  });

  it('complete_upload gives the media URL', async () => {
    upload.completeChunkUpload.mockResolvedValue({ publicUrl: 'https://cdn/x.mp4', filename: 'x.mp4', size: 9 });
    await expect(tool('complete_upload').handler({ uploadId: UUID }, ctx)).resolves.toMatchObject({
      mediaUrl: 'https://cdn/x.mp4',
      size: 9,
      next: 'Use mediaUrl in create_post.',
    });
    expect(upload.completeChunkUpload).toHaveBeenCalledWith(UUID, 't1');
  });

  it('complete_upload needs a UUID', () => {
    expect(tool('complete_upload').inputSchema.safeParse({ uploadId: 'nope' }).success).toBe(false);
  });
  it('import_media_from_url has the description', () => {
    expect(tool('import_media_from_url').description).toBe(
      'Import a video or image from a public https URL (300 MB or less). The server downloads it in the background. Returns a jobId for get_job.',
    );
  });

  it('import_media_from_url queues a job with a unique ID and attempts 1', async () => {
    queue.add.mockImplementation((_n, _d, o) => Promise.resolve({ id: o.jobId }));
    const out: any = await tool('import_media_from_url').handler({ url: 'https://cdn.example.com/v.mp4' }, ctx);
    expect(queue.add).toHaveBeenCalledWith(
      'import-url',
      { url: 'https://cdn.example.com/v.mp4', tenantId: 't1', userId: 'u1' },
      expect.objectContaining({ attempts: 1, jobId: expect.stringMatching(/^media-import-[0-9a-f-]{36}$/) }),
    );
    expect(queue.add.mock.calls[0][2]).toMatchObject({ removeOnComplete: 100, removeOnFail: 100 });
    expect(out.jobId).toMatch(/^media-import-/);
    expect(out.next).toBe('Call get_job with this jobId until status is completed. Then use result.mediaUrl in create_post.');
  });

  it('import_media_from_url gives a new job ID for each call', async () => {
    queue.add.mockImplementation((_n, _d, o) => Promise.resolve({ id: o.jobId }));
    const a: any = await tool('import_media_from_url').handler({ url: 'https://cdn.example.com/v.mp4' }, ctx);
    const b: any = await tool('import_media_from_url').handler({ url: 'https://cdn.example.com/v.mp4' }, ctx);
    expect(a.jobId).not.toBe(b.jobId);
  });

  it('import_media_from_url rejects a private URL before it queues', async () => {
    await expect(tool('import_media_from_url').handler({ url: 'https://127.0.0.1/v.mp4' }, ctx)).rejects.toThrow(McpToolError);
    expect(queue.add).not.toHaveBeenCalled();
  });
});
