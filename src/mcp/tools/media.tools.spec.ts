// MediaToolsGroup loads UploadService, which imports the ESM-only uuid package.
jest.mock('uuid', () => ({ v4: () => require('crypto').randomUUID() }));

import { BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MediaToolsGroup } from './media.tools';
import { UploadTokenService } from '../upload-token.service';
import { McpAuthContext } from '../mcp-auth.context';

const UUID = '3f2b8c1e-4d5a-4b6c-8e7f-9a0b1c2d3e4f';

const ctx: McpAuthContext = {
  userId: 'u1',
  tenantId: 't1',
  grant: { isUser: false, scopes: [] },
  keyPrefix: 'jeu_ab',
  apiBaseUrl: 'https://x/api',
};

describe('MediaToolsGroup', () => {
  let upload: { initChunkUpload: jest.Mock; completeChunkUpload: jest.Mock };
  let tokens: UploadTokenService;
  let group: MediaToolsGroup;
  const tool = (name: string) => group.tools().find((t) => t.name === name)!;

  beforeEach(() => {
    upload = { initChunkUpload: jest.fn(), completeChunkUpload: jest.fn() };
    tokens = new UploadTokenService(new JwtService({ secret: 's' }));
    group = new MediaToolsGroup(upload as any, tokens);
  });

  it('both tools need posts:write', () => {
    expect(tool('create_upload').scopes).toEqual(['posts:write']);
    expect(tool('complete_upload').scopes).toEqual(['posts:write']);
  });

  it('create_upload gives the chunk count and the commands', async () => {
    upload.initChunkUpload.mockResolvedValue('up1');
    const out: any = await tool('create_upload').handler({ filename: 'v.mp4', sizeBytes: 120_000_000, mimeType: 'video/mp4' }, ctx);
    expect(upload.initChunkUpload).toHaveBeenCalledWith('v.mp4', 120_000_000, 3, 'video/mp4', 't1');
    expect(out).toMatchObject({ uploadId: 'up1', chunkSize: 52428800, totalChunks: 3 });
    expect(out.commands[1]).toContain('https://x/api/mcp/uploads/up1/chunks/0');
    expect(tokens.verify(out.uploadToken, 'up1')).toEqual({ tenantId: 't1' });
    expect(out.expiresAt).toEqual(expect.any(String));
    expect(out.next).toBe('Run the commands in the folder of the file. Then call complete_upload with this uploadId.');
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
});
