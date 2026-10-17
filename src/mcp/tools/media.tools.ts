import { randomUUID } from 'crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { z } from 'zod/v4';
import { MEDIA_IMPORT_JOBS, QUEUE_NAMES } from '../../queue/queue.config';
import { UploadService } from '../../upload/upload.service';
import { McpToolDef, McpToolError, McpToolGroup } from '../mcp-tool';
import { McpAuthContext } from '../mcp-auth.context';
import { UploadTokenService } from '../upload-token.service';
import { buildUploadCommands, CHUNK_SIZE, MAX_UPLOAD_BYTES } from '../upload-commands';
import type { MediaImportJobData } from '../processors/media-import.processor';
import { assertAllowedUrl } from '../ssrf-guard';

const createUploadInput = z.object({
  filename: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[^/\\]+$/, 'The file name must not contain / or \\. Give the name only, not the path.')
    // eslint-disable-next-line no-control-regex
    .regex(/^[^\x00-\x1f\x7f]+$/, 'The file name must not contain control characters. Rename the file first.'),
  sizeBytes: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
  mimeType: z.string().regex(/^(video|image)\/[\w.+-]+$/, 'The mimeType must be a video or image type, for example video/mp4.'),
});

const completeUploadInput = z.object({ uploadId: z.uuid() });

const importMediaInput = z.object({ url: z.string().min(1).max(2048) });

@Injectable()
export class MediaToolsGroup implements McpToolGroup {
  constructor(
    private readonly uploadService: UploadService,
    private readonly uploadTokens: UploadTokenService,
    @InjectQueue(QUEUE_NAMES.MEDIA_IMPORT) private readonly mediaImportQueue: Queue<MediaImportJobData>,
  ) {}

  tools(): McpToolDef[] {
    return [
      {
        name: 'create_upload',
        title: 'Start a file upload',
        description:
          'Start an upload of a local video or image (300 MB or less). Run the returned commands in bash (Git Bash on Windows), not in PowerShell or cmd. Then call complete_upload. For a file that is already on the web, use import_media_from_url.',
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
      {
        name: 'import_media_from_url',
        title: 'Import media from a URL',
        description:
          'Import a video or image from a public https URL (300 MB or less). The server downloads it in the background. Returns a jobId for get_job.',
        scopes: ['posts:write'],
        inputSchema: importMediaInput,
        handler: (args: z.infer<typeof importMediaInput>, ctx: McpAuthContext) => this.importMedia(args.url, ctx),
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
      uploadId,
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
      next: 'Run the commands in bash (Git Bash on Windows) in the folder of the file. Then call complete_upload with this uploadId.',
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

  private async importMedia(url: string, ctx: McpAuthContext) {
    assertAllowedUrl(url);
    // BullMQ numbers jobs per queue. A UUID keeps the ID unique across the queues that get_job reads.
    const jobId = `media-import-${randomUUID()}`;
    await this.mediaImportQueue.add(
      MEDIA_IMPORT_JOBS.IMPORT_URL,
      { url, tenantId: ctx.tenantId, userId: ctx.userId },
      { jobId, attempts: 1, removeOnComplete: 100, removeOnFail: 100 },
    );
    return {
      jobId,
      next: 'Call get_job with this jobId until status is completed. Then use result.mediaUrl in create_post.',
    };
  }
}
