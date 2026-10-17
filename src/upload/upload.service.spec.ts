import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// uuid 14 ships ESM only, which Jest cannot load here. crypto gives the same v4 format.
jest.mock('uuid', () => ({
  v4: () => jest.requireActual<typeof import('crypto')>('crypto').randomUUID(),
}));

const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jeu-up-'));
process.env.UPLOAD_DIR = uploadDir;

// Load the service after UPLOAD_DIR is set, because it reads the env at load time.
const { UploadService } =
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('./upload.service') as typeof import('./upload.service');

describe('UploadService chunked uploads', () => {
  let svc: InstanceType<typeof UploadService>;

  beforeEach(() => {
    svc = new UploadService();
  });

  afterAll(() => {
    fs.rmSync(uploadDir, { recursive: true, force: true });
  });

  it('rejects a session from a different tenant', async () => {
    const id = await svc.initChunkUpload('a.mp4', 10, 1, 'video/mp4', 't1');
    await expect(svc.saveChunk(id, 0, Buffer.from('x'), 't2')).rejects.toThrow(
      `Invalid upload session: ${id}`,
    );
    await expect(svc.completeChunkUpload(id, 't2')).rejects.toThrow(
      `Invalid upload session: ${id}`,
    );
  });

  it('rejects a chunk index out of range', async () => {
    const id = await svc.initChunkUpload('a.mp4', 10, 2, 'video/mp4', 't1');
    await expect(svc.saveChunk(id, 2, Buffer.from('x'), 't1')).rejects.toThrow(
      'chunkIndex must be between 0 and 1',
    );
    await expect(svc.saveChunk(id, -1, Buffer.from('x'), 't1')).rejects.toThrow(
      'chunkIndex must be between 0 and 1',
    );
  });

  it('lists the missing chunks', async () => {
    const id = await svc.initChunkUpload('a.mp4', 10, 5, 'video/mp4', 't1');
    for (const i of [0, 1, 3])
      await svc.saveChunk(id, i, Buffer.from('x'), 't1');
    await expect(svc.completeChunkUpload(id, 't1')).rejects.toThrow(
      'Missing chunks: 2, 4.',
    );
  });

  it('counts a repeated chunk one time', async () => {
    const id = await svc.initChunkUpload('a.mp4', 2, 2, 'video/mp4', 't1');
    await svc.saveChunk(id, 0, Buffer.from('a'), 't1');
    await svc.saveChunk(id, 0, Buffer.from('a'), 't1');
    await expect(svc.completeChunkUpload(id, 't1')).rejects.toThrow(
      'Missing chunks: 1.',
    );
  });

  it('assembles the chunks in order', async () => {
    const id = await svc.initChunkUpload('a.mp4', 4, 2, 'video/mp4', 't1');
    await svc.saveChunk(id, 1, Buffer.from('cd'), 't1');
    await svc.saveChunk(id, 0, Buffer.from('ab'), 't1');
    const res = await svc.completeChunkUpload(id, 't1');
    expect(res.size).toBe(4);
    expect(
      fs.readFileSync(path.join(process.env.UPLOAD_DIR!, res.filename), 'utf8'),
    ).toBe('abcd');
  });

  it('rejects an assembled file that is not the declared size, and deletes it', async () => {
    const id = await svc.initChunkUpload('a.mp4', 10, 2, 'video/mp4', 't1');
    await svc.saveChunk(id, 0, Buffer.from('ab'), 't1');
    await svc.saveChunk(id, 1, Buffer.from('cd'), 't1');
    const before = fs.readdirSync(uploadDir).sort();
    await expect(svc.completeChunkUpload(id, 't1')).rejects.toThrow(
      'The file size is 4 bytes, but create_upload said 10 bytes.',
    );
    expect(fs.readdirSync(uploadDir).sort()).toEqual(before);
  });

  it('gives an import target in the upload folder', () => {
    const t = svc.createImportTarget('.mp4');
    expect(t.filePath.startsWith(process.env.UPLOAD_DIR!)).toBe(true);
    expect(t.publicUrl).toMatch(/\/[0-9a-f-]{36}\.mp4$/);
  });
  it.each(['/../x', '../x.mp4', 'mp4', '.mp4/..', '.', '.verylongext1', '.mp 4', ''])(
    'rejects the import extension %j',
    (ext) => {
      expect(() => svc.createImportTarget(ext)).toThrow();
    },
  );
});
