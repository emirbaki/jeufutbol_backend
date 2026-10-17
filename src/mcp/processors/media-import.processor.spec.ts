// UploadService imports the ESM-only uuid package.
jest.mock('uuid', () => ({ v4: () => require('crypto').randomUUID() }));

import * as fs from 'fs';
import * as http from 'http';
import { AddressInfo } from 'net';
import * as os from 'os';
import * as path from 'path';
import { Readable } from 'stream';
import dns from 'node:dns';
import axios, { AxiosError } from 'axios';
import { Job } from 'bullmq';
import { MediaImportJobData } from './media-import.processor';
import { McpToolError } from '../mcp-tool';
import * as ssrfGuard from '../ssrf-guard';
import { PRIVATE_ADDRESS_MESSAGE, safeLookup } from '../ssrf-guard';

const NO_ANSWER =
  'The server of the URL did not answer correctly. Check that the URL works in a browser, then try again.';

const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jeu-imp-'));
process.env.UPLOAD_DIR = uploadDir;

// Load the services after UPLOAD_DIR is set, because UploadService reads the env at load time.
/* eslint-disable @typescript-eslint/no-require-imports */
const { UploadService } =
  require('../../upload/upload.service') as typeof import('../../upload/upload.service');
const { MediaImportProcessor } =
  require('./media-import.processor') as typeof import('./media-import.processor');
/* eslint-enable @typescript-eslint/no-require-imports */

const job = (data: Partial<MediaImportJobData>) =>
  ({
    id: 'media-import-1',
    name: 'import-url',
    data: { tenantId: 't1', userId: 'u1', ...data },
  }) as Job<MediaImportJobData>;

const mediaFiles = () => fs.readdirSync(uploadDir).filter((f) => f !== 'temp');

describe('MediaImportProcessor', () => {
  let proc: InstanceType<typeof MediaImportProcessor>;

  beforeEach(() => {
    proc = new MediaImportProcessor(new UploadService());
    for (const f of mediaFiles())
      fs.rmSync(path.join(uploadDir, f), { force: true });
  });

  afterEach(() => {
    delete process.env.MEDIA_IMPORT_MAX_BYTES;
    jest.restoreAllMocks();
  });

  afterAll(() => fs.rmSync(uploadDir, { recursive: true, force: true }));

  it('saves the file and gives the media URL', async () => {
    jest.spyOn(proc as any, 'openStream').mockResolvedValue({
      stream: Readable.from([Buffer.alloc(10)]),
      contentType: 'video/mp4',
    });
    const r = await proc.process(job({ url: 'https://cdn.example.com/a.mp4' }));
    expect(r).toMatchObject({ size: 10, mimeType: 'video/mp4' });
    expect(r.mediaUrl).toMatch(/\.mp4$/);
    const files = mediaFiles();
    expect(files).toHaveLength(1);
    expect(fs.statSync(path.join(uploadDir, files[0])).size).toBe(10);
  });

  it('uses the allow-list extension and ignores the URL extension', async () => {
    jest.spyOn(proc as any, 'openStream').mockResolvedValue({
      stream: Readable.from([Buffer.alloc(3)]),
      contentType: 'image/png; charset=binary',
    });
    const r = await proc.process(job({ url: 'https://cdn.example.com/a.php' }));
    expect(r).toMatchObject({ mimeType: 'image/png' });
    expect(r.mediaUrl).toMatch(/\.png$/);
  });

  it.each([
    ['video/x-matroska', '.mkv'],
    ['image/gif', '.gif'],
  ])('maps %s to %s', async (contentType, ext) => {
    jest.spyOn(proc as any, 'openStream').mockResolvedValue({
      stream: Readable.from([Buffer.alloc(3)]),
      contentType,
    });
    const r = await proc.process(job({ url: 'https://cdn.example.com/a.php' }));
    expect(r.mediaUrl.endsWith(ext)).toBe(true);
  });

  it('uses an allowed URL path extension for another video type', async () => {
    jest.spyOn(proc as any, 'openStream').mockResolvedValue({
      stream: Readable.from([Buffer.alloc(3)]),
      contentType: 'video/x-msvideo',
    });
    const r = await proc.process(
      job({ url: 'https://cdn.example.com/dir/clip.AVI?x=1' }),
    );
    expect(r.mediaUrl).toMatch(/\.avi$/);
  });

  it.each([
    ['video/x-msvideo', 'https://cdn.example.com/clip'],
    ['video/x-msvideo', 'https://cdn.example.com/a.%2F..%2Fx'],
    ['video/x-msvideo', 'https://cdn.example.com/a.verylongextension'],
    ['video/x-foo', 'https://cdn.example.com/a.pdf'],
    ['video/x-foo', 'https://cdn.example.com/a.html'],
    ['image/svg+xml', 'https://cdn.example.com/a.svg'],
    ['image/x-foo', 'https://cdn.example.com/a.js'],
  ])(
    'rejects %s when the URL path extension is not allowed (%s)',
    async (contentType, url) => {
      jest.spyOn(proc as any, 'openStream').mockResolvedValue({
        stream: Readable.from([Buffer.alloc(3)]),
        contentType,
      });
      await expect(proc.process(job({ url }))).rejects.toThrow(
        'The URL does not point to a video or an image.',
      );
      expect(mediaFiles()).toHaveLength(0);
    },
  );

  it.each(['-1', 'abc', '0', '1.5'])(
    'uses the default size limit when MEDIA_IMPORT_MAX_BYTES is %j',
    async (value) => {
      process.env.MEDIA_IMPORT_MAX_BYTES = value;
      jest.spyOn(proc as any, 'openStream').mockResolvedValue({
        stream: Readable.from([Buffer.alloc(10)]),
        contentType: 'video/mp4',
      });
      const r = await proc.process(
        job({ url: 'https://cdn.example.com/a.mp4' }),
      );
      expect(r.size).toBe(10);
    },
  );

  it('stops at the size limit and deletes the partial file', async () => {
    process.env.MEDIA_IMPORT_MAX_BYTES = '5';
    jest.spyOn(proc as any, 'openStream').mockResolvedValue({
      stream: Readable.from([Buffer.alloc(10)]),
      contentType: 'video/mp4',
    });
    await expect(
      proc.process(job({ url: 'https://cdn.example.com/a.mp4' })),
    ).rejects.toThrow('The file is larger than 5 bytes.');
    expect(
      fs.readdirSync(uploadDir).filter((f) => f.endsWith('.mp4')),
    ).toHaveLength(0);
  });

  it('rejects a type that is not video or image', async () => {
    const stream = Readable.from([Buffer.alloc(1)]);
    jest
      .spyOn(proc as any, 'openStream')
      .mockResolvedValue({ stream, contentType: 'text/html' });
    await expect(
      proc.process(job({ url: 'https://cdn.example.com/a' })),
    ).rejects.toThrow('The URL does not point to a video or an image.');
    expect(stream.destroyed).toBe(true);
    expect(mediaFiles()).toHaveLength(0);
  });

  it('deletes the partial file when the stream fails', async () => {
    const stream = new Readable({
      read() {
        this.push(Buffer.alloc(4));
        this.destroy(new Error('socket hang up'));
      },
    });
    jest
      .spyOn(proc as any, 'openStream')
      .mockResolvedValue({ stream, contentType: 'video/mp4' });
    await expect(
      proc.process(job({ url: 'https://cdn.example.com/a.mp4' })),
    ).rejects.toThrow('socket hang up');
    expect(mediaFiles()).toHaveLength(0);
  });

  it('deletes the partial file when the download times out', async () => {
    const timeout = new DOMException(
      'The operation timed out.',
      'TimeoutError',
    );
    jest
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(AbortSignal.abort(timeout));
    const stream = new Readable({ read() {} });
    jest
      .spyOn(proc as any, 'openStream')
      .mockResolvedValue({ stream, contentType: 'video/mp4' });
    await expect(
      proc.process(job({ url: 'https://cdn.example.com/a.mp4' })),
    ).rejects.toThrow('The download took longer than 5 minutes.');
    expect(mediaFiles()).toHaveLength(0);
  });

  it('checks the URL again before it downloads', async () => {
    const open = jest.spyOn(proc as any, 'openStream');
    await expect(
      proc.process(job({ url: 'https://169.254.169.254/latest' })),
    ).rejects.toThrow(McpToolError);
    expect(open).not.toHaveBeenCalled();
  });

  describe('openStream', () => {
    it('uses the safe lookup, no proxy, 3 redirects and a redirect check', async () => {
      const get = jest.spyOn(axios, 'get').mockResolvedValue({
        data: Readable.from([]),
        headers: { 'content-type': 'video/mp4' },
      });
      const signal = new AbortController().signal;
      const out = await (proc as any).openStream(
        new URL('https://cdn.example.com/a.mp4'),
        signal,
      );
      expect(out.contentType).toBe('video/mp4');
      const [url, cfg] = get.mock.calls[0] as [string, any];
      expect(url).toBe('https://cdn.example.com/a.mp4');
      expect(cfg).toMatchObject({
        responseType: 'stream',
        maxRedirects: 3,
        proxy: false,
        signal,
      });
      expect(cfg.httpsAgent.options.lookup).toBe(safeLookup);
      expect(() =>
        cfg.beforeRedirect({ href: 'http://cdn.example.com/a.mp4' }),
      ).toThrow(McpToolError);
      expect(() =>
        cfg.beforeRedirect({ href: 'https://10.0.0.1/a.mp4' }),
      ).toThrow(McpToolError);
      expect(() =>
        cfg.beforeRedirect({ href: 'https://[::ffff:7f00:1]/a.mp4' }),
      ).toThrow(McpToolError);
      expect(() =>
        cfg.beforeRedirect({ href: 'https://cdn2.example.com/a.mp4' }),
      ).not.toThrow();
    });

    it.each([
      ['ENOTFOUND', 'The host of the URL does not exist. Check the URL.'],
      ['ECONNREFUSED', NO_ANSWER],
      ['ECONNRESET', NO_ANSWER],
      ['ETIMEDOUT', NO_ANSWER],
      ['CERT_HAS_EXPIRED', NO_ANSWER],
      ['ERR_TLS_CERT_ALTNAME_INVALID', NO_ANSWER],
      [
        'ERR_FR_TOO_MANY_REDIRECTS',
        'The URL redirects more than 3 times. Use the final URL of the file.',
      ],
    ])('maps the wrapped error code %s to tool text', async (code, message) => {
      const inner = Object.assign(new Error('low level'), { code });
      const wrapped = AxiosError.from(inner, undefined);
      jest.spyOn(axios, 'get').mockRejectedValue(wrapped);
      const err = await (proc as any)
        .openStream(
          new URL('https://cdn.example.com/a.mp4'),
          new AbortController().signal,
        )
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(McpToolError);
      expect(err.message).toBe(message);
    });

    it('sends a real request through safeLookup', async () => {
      jest
        .spyOn(dns, 'lookup')
        .mockImplementation(((h, o, cb: any) =>
          cb(null, [{ address: '10.0.0.5', family: 4 }])) as any);
      await expect(
        (proc as any).openStream(
          new URL('https://internal.example.com/v.mp4'),
          AbortSignal.timeout(5000),
        ),
      ).rejects.toThrow(PRIVATE_ADDRESS_MESSAGE);
      expect(dns.lookup).toHaveBeenCalledWith(
        'internal.example.com',
        expect.objectContaining({ all: true }),
        expect.any(Function),
      );
    });

    it('maps a host that does not exist from a real request', async () => {
      jest
        .spyOn(dns, 'lookup')
        .mockImplementation(((h, o, cb: any) =>
          cb(
            Object.assign(new Error('getaddrinfo ENOTFOUND'), {
              code: 'ENOTFOUND',
            }),
          )) as any);
      await expect(
        (proc as any).openStream(
          new URL('https://nope.example.com/v.mp4'),
          AbortSignal.timeout(5000),
        ),
      ).rejects.toThrow('The host of the URL does not exist. Check the URL.');
    });

    describe('with a real redirect from a local server', () => {
      let server: http.Server;
      let base: string;
      let targetHits: number;
      let location: string;

      beforeAll(async () => {
        server = http.createServer((req, res) => {
          const hop = /^\/hop\/(\d+)$/.exec(req.url ?? '');
          if (hop) {
            const left = Number(hop[1]);
            if (left === 0) targetHits++;
            res.writeHead(left > 0 ? 302 : 200, {
              Location: `/hop/${left - 1}`,
              'Content-Type': 'video/mp4',
            });
            res.end(left > 0 ? '' : 'ok');
            return;
          }
          if (req.url === '/start') {
            res.writeHead(302, { Location: location });
            res.end();
            return;
          }
          targetHits++;
          res.writeHead(200, { 'Content-Type': 'video/mp4' });
          res.end('secret');
        });
        await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
        base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      });

      afterAll(() => new Promise<void>((r) => server.close(() => r())));

      beforeEach(() => (targetHits = 0));

      it.each([
        ['an http URL', () => `${base}/target`],
        [
          'a private IP literal',
          () => `https://127.0.0.1:${new URL(base).port}/target`,
        ],
      ])('fails on a redirect to %s', async (_label, to) => {
        location = to();
        await expect(
          (proc as any).openStream(
            new URL(`${base}/start`),
            AbortSignal.timeout(5000),
          ),
        ).rejects.toThrow(McpToolError);
        expect(targetHits).toBe(0);
      });

      describe('when the redirect check passes', () => {
        // The local server speaks http on 127.0.0.1, so let the URL check pass here.
        beforeEach(() =>
          jest
            .spyOn(ssrfGuard, 'assertAllowedUrl')
            .mockImplementation((u: string) => new URL(u)),
        );

        it('follows 3 redirects', async () => {
          const out = await (proc as any).openStream(
            new URL(`${base}/hop/3`),
            AbortSignal.timeout(5000),
          );
          out.stream.resume();
          expect(targetHits).toBe(1);
        });

        it('fails on the 4th redirect', async () => {
          await expect(
            (proc as any).openStream(
              new URL(`${base}/hop/4`),
              AbortSignal.timeout(5000),
            ),
          ).rejects.toThrow(
            'The URL redirects more than 3 times. Use the final URL of the file.',
          );
          expect(targetHits).toBe(0);
        });
      });
    });
  });
});
