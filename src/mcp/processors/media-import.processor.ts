import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import { Job } from 'bullmq';
import { MEDIA_IMPORT_JOBS, QUEUE_NAMES } from '../../queue/queue.config';
import { IMPORT_EXT_PATTERN, UploadService } from '../../upload/upload.service';
import { McpToolError } from '../mcp-tool';
import { assertAllowedUrl, safeLookup } from '../ssrf-guard';

export interface MediaImportJobData {
  url: string;
  tenantId: string;
  userId: string;
}

export interface MediaImportResult {
  mediaUrl: string;
  size: number;
  mimeType: string;
}

const DEFAULT_MAX_BYTES = 314572800;
const IMPORT_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_REDIRECTS = 3;

const TYPE_EXTENSIONS: Record<string, string> = {
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

/** Types and URL extensions that a browser can run as active content when the CDN serves them. */
const ACTIVE_TYPES = new Set(['image/svg+xml']);
const ACTIVE_EXTENSIONS = new Set([
  '.html',
  '.htm',
  '.xhtml',
  '.xht',
  '.shtml',
  '.svg',
  '.svgz',
  '.xml',
  '.js',
  '.mjs',
  '.php',
  '.phtml',
  '.asp',
  '.aspx',
  '.jsp',
  '.cgi',
  '.pl',
  '.py',
  '.sh',
  '.exe',
  '.bat',
  '.cmd',
]);

const NOT_MEDIA_MESSAGE =
  'The URL does not point to a video or an image. Use a direct link to the video or image file.';

@Processor(QUEUE_NAMES.MEDIA_IMPORT)
export class MediaImportProcessor extends WorkerHost {
  private readonly logger = new Logger(MediaImportProcessor.name);

  constructor(private readonly uploadService: UploadService) {
    super();
  }

  async process(job: Job<MediaImportJobData>): Promise<MediaImportResult> {
    if (job.name !== MEDIA_IMPORT_JOBS.IMPORT_URL) {
      throw new Error(`Unknown job type: ${job.name}`);
    }
    // Check again in the worker: a job can reach the queue without the tool.
    const url = assertAllowedUrl(job.data.url);
    const maxBytes =
      Number(process.env.MEDIA_IMPORT_MAX_BYTES) || DEFAULT_MAX_BYTES;
    const signal = AbortSignal.timeout(IMPORT_TIMEOUT_MS);
    // Log the host only. A query string can hold a signed token.
    this.logger.log(
      `Job ${job.id}: importing from ${url.hostname} for tenant ${job.data.tenantId}`,
    );

    let stream: Readable | undefined;
    let filePath: string | undefined;
    try {
      const opened = await this.openStream(url, signal);
      stream = opened.stream;
      const mimeType = opened.contentType.split(';')[0].trim().toLowerCase();
      const target = this.uploadService.createImportTarget(
        this.extensionFor(mimeType, url),
      );
      filePath = target.filePath;

      let size = 0;
      const counter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          size += chunk.length;
          if (size > maxBytes) {
            callback(
              new McpToolError(
                `The file is larger than ${maxBytes} bytes. Use a smaller file.`,
              ),
            );
            return;
          }
          callback(null, chunk);
        },
      });
      await pipeline(stream, counter, fs.createWriteStream(filePath), {
        signal,
      });

      this.logger.log(`Job ${job.id}: imported ${size} bytes of ${mimeType}`);
      return { mediaUrl: target.publicUrl, size, mimeType };
    } catch (err) {
      stream?.destroy();
      if (filePath)
        await fs.promises.rm(filePath, { force: true }).catch(() => undefined);
      if (signal.aborted) {
        throw new McpToolError(
          'The download took longer than 5 minutes. Use a faster server or a smaller file.',
        );
      }
      throw err;
    }
  }

  /** Open the download. Every connection goes through safeLookup, and every redirect is checked. */
  protected async openStream(
    url: URL,
    signal: AbortSignal,
  ): Promise<{ stream: Readable; contentType: string }> {
    try {
      const res = await axios.get<Readable>(url.href, {
        responseType: 'stream',
        httpsAgent: new https.Agent({ lookup: safeLookup }),
        // A proxy would resolve the host itself and skip safeLookup.
        proxy: false,
        maxRedirects: MAX_REDIRECTS,
        // follow-redirects gives the options of the next request. href is the full next URL.
        beforeRedirect: (options) => {
          assertAllowedUrl(options.href);
        },
        signal,
      });
      return {
        stream: res.data,
        contentType: String(res.headers['content-type'] ?? ''),
      };
    } catch (err) {
      const toolError = findToolError(err);
      if (toolError) throw toolError;
      if (err instanceof AxiosError && err.response) {
        (err.response.data as Readable | undefined)?.destroy?.();
        throw new McpToolError(
          `The server answered with HTTP ${err.response.status}. Check that the URL is a public direct link to the file.`,
        );
      }
      throw err;
    }
  }

  /** The file extension from the allow-list, or a clean extension from the URL path for another media type. */
  private extensionFor(mimeType: string, url: URL): string {
    const known = TYPE_EXTENSIONS[mimeType];
    if (known) return known;
    if (
      !/^(video|image)\/[\w.+-]+$/.test(mimeType) ||
      ACTIVE_TYPES.has(mimeType)
    ) {
      throw new McpToolError(NOT_MEDIA_MESSAGE);
    }
    const ext = path.posix.extname(url.pathname).toLowerCase();
    if (!IMPORT_EXT_PATTERN.test(ext) || ACTIVE_EXTENSIONS.has(ext)) {
      throw new McpToolError(
        `The server sent the type ${mimeType}, but the URL path has no usable file extension. Use a URL whose path ends with the file extension, for example .mkv.`,
      );
    }
    return ext;
  }
}

/** axios and follow-redirects wrap an error from beforeRedirect or lookup. Find it in the cause chain. */
function findToolError(err: unknown): McpToolError | undefined {
  for (
    let e = err, depth = 0;
    e && depth < 5;
    e = (e as { cause?: unknown }).cause, depth++
  ) {
    if (e instanceof McpToolError) return e;
  }
  return undefined;
}
