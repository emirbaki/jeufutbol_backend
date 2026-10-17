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
import { UploadService } from '../../upload/upload.service';
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
  'video/x-matroska': '.mkv',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

/** The only URL path extensions that another video or image type can use (ruling R12: an allow-list). */
const URL_EXTENSIONS = new Set([
  '.mp4',
  '.mov',
  '.webm',
  '.m4v',
  '.mkv',
  '.avi',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
]);

const NOT_MEDIA_MESSAGE =
  'The URL does not point to a video or an image. Use a direct link to the video or image file.';
const TOO_MANY_REDIRECTS_MESSAGE = `The URL redirects more than ${MAX_REDIRECTS} times. Use the final URL of the file.`;
const HOST_NOT_FOUND_MESSAGE =
  'The host of the URL does not exist. Check the URL.';
const NO_ANSWER_MESSAGE =
  'The server of the URL did not answer correctly. Check that the URL works in a browser, then try again.';
/** Connection and TLS error codes that mean the server did not answer correctly. */
const NO_ANSWER_CODES =
  /^(ECONNREFUSED|ECONNRESET|ETIMEDOUT|EPIPE|EPROTO|EHOSTUNREACH|ENETUNREACH|EAI_AGAIN|ERR_TLS_|ERR_SSL_|CERT_|UNABLE_TO_|DEPTH_ZERO_|SELF_SIGNED_)/;

/** MEDIA_IMPORT_MAX_BYTES when it is a positive integer, otherwise the default. */
function readMaxBytes(): number {
  const value = Number(process.env.MEDIA_IMPORT_MAX_BYTES);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_MAX_BYTES;
}

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
    const maxBytes = readMaxBytes();
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
      // process() turns an abort into the timeout message.
      if (signal.aborted) throw err;
      const codes = errorCodes(err);
      if (codes.includes('ERR_FR_TOO_MANY_REDIRECTS')) {
        throw new McpToolError(TOO_MANY_REDIRECTS_MESSAGE);
      }
      if (codes.includes('ENOTFOUND')) {
        throw new McpToolError(HOST_NOT_FOUND_MESSAGE);
      }
      if (codes.some((c) => NO_ANSWER_CODES.test(c))) {
        throw new McpToolError(NO_ANSWER_MESSAGE);
      }
      throw err;
    }
  }

  /** The file extension from the type list, or an allowed extension from the URL path for another media type. */
  private extensionFor(mimeType: string, url: URL): string {
    const known = TYPE_EXTENSIONS[mimeType];
    if (known) return known;
    const ext = path.posix.extname(url.pathname).toLowerCase();
    if (/^(video|image)\/[\w.+-]+$/.test(mimeType) && URL_EXTENSIONS.has(ext)) {
      return ext;
    }
    throw new McpToolError(NOT_MEDIA_MESSAGE);
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

/** The error codes in the cause chain, for example ENOTFOUND under an AxiosError. */
function errorCodes(err: unknown): string[] {
  const codes: string[] = [];
  for (
    let e = err, depth = 0;
    e && depth < 5;
    e = (e as { cause?: unknown }).cause, depth++
  ) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === 'string') codes.push(code);
  }
  return codes;
}
