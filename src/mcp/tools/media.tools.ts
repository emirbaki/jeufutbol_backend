import { BadRequestException, Injectable } from '@nestjs/common';
import { z } from 'zod/v4';
import { UploadService } from '../../upload/upload.service';
import { McpToolDef, McpToolError, McpToolGroup } from '../mcp-tool';
import { McpAuthContext } from '../mcp-auth.context';
import { UploadTokenService } from '../upload-token.service';
import { buildUploadCommands, CHUNK_SIZE, MAX_UPLOAD_BYTES } from '../upload-commands';

const createUploadInput = z.object({
  filename: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[^/\\]+$/, 'The file name must not contain / or \\. Give the name only, not the path.'),
  sizeBytes: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
  mimeType: z.string().regex(/^(video|image)\/[\w.+-]+$/, 'The mimeType must be a video or image type, for example video/mp4.'),
});

const completeUploadInput = z.object({ uploadId: z.uuid() });

@Injectable()
export class MediaToolsGroup implements McpToolGroup {
  constructor(
    private readonly uploadService: UploadService,
    private readonly uploadTokens: UploadTokenService,
  ) {}

  tools(): McpToolDef[] {
    return [
      {
        name: 'create_upload',
        title: 'Start a file upload',
        description:
          'Start an upload of a local video or image (300 MB or less). Run the returned commands in a shell, then call complete_upload. For a file that is already on the web, use import_media_from_url.',
        scopes: ['posts:write'],
        inputSchema: createUploadInput,
        handler: (args: z.infer<typeof createUploadInput>, ctx: McpAuthContext) => this.createUpload(args, ctx),
      },
      {
        name: 'complete_upload',
        title: 'Finish a file upload',
        description: 'Finish an upload after all chunk commands ran. Returns the mediaUrl for create_post.',
        scopes: ['posts:write'],
        inputSchema: completeUploadInput,
        handler: (args: z.infer<typeof completeUploadInput>, ctx: McpAuthContext) =>
          this.completeUpload(args.uploadId, ctx),
      },
    ];
  }

  private async createUpload(args: z.infer<typeof createUploadInput>, ctx: McpAuthContext) {
    const totalChunks = Math.ceil(args.sizeBytes / CHUNK_SIZE);
    const uploadId = await this.uploadService.initChunkUpload(
      args.filename,
      args.sizeBytes,
      totalChunks,
      args.mimeType,
      ctx.tenantId,
    );
    const { token, expiresAt } = this.uploadTokens.sign(uploadId, ctx.tenantId);
    const commands = buildUploadCommands({
      chunkUrlBase: `${ctx.apiBaseUrl}/mcp/uploads/${uploadId}/chunks`,
      token,
      filename: args.filename,
      totalChunks,
    });
    return {
      uploadId,
      uploadToken: token,
      chunkSize: CHUNK_SIZE,
      totalChunks,
      expiresAt: expiresAt.toISOString(),
      commands,
      next: 'Run the commands in the folder of the file. Then call complete_upload with this uploadId.',
    };
  }

  private async completeUpload(uploadId: string, ctx: McpAuthContext) {
    try {
      const { publicUrl, size } = await this.uploadService.completeChunkUpload(uploadId, ctx.tenantId);
      return { mediaUrl: publicUrl, size, next: 'Use mediaUrl in create_post.' };
    } catch (err) {
      if (err instanceof BadRequestException && err.message.startsWith('Missing chunks:')) {
        throw new McpToolError(`${err.message} Send them again, then call complete_upload.`);
      }
      throw err;
    }
  }
}
