import { buildUploadCommands, shellQuote, splitSuffix } from './upload-commands';

const UP = '3f2b8c1e-4d5a-4b6c-8e7f-9a0b1c2d3e4f';
const BASE = `https://x/api/mcp/uploads/${UP}/chunks`;
const build = (filename: string, totalChunks: number) =>
  buildUploadCommands({ chunkUrlBase: BASE, uploadId: UP, token: 'T', filename, totalChunks });

describe('upload commands', () => {
  it('quotes shell characters', () => {
    expect(shellQuote(`a'; rm -rf ~; '.mp4`)).toBe(`'a'\\''; rm -rf ~; '\\''.mp4'`);
  });

  it('makes split suffixes', () => {
    expect([0, 1, 25, 26, 675].map(splitSuffix)).toEqual(['aaa', 'aab', 'aaz', 'aba', 'azz']);
  });

  it('gives one curl command for one chunk', () => {
    expect(build('my video.mp4', 1)).toEqual([
      `curl -sS --fail-with-body -X POST '${BASE}/0' -H 'X-Upload-Token: T' -F 'chunk=@my video.mp4'`,
    ]);
  });

  it('gives split, one curl for each chunk, and cleanup for more chunks, with a prefix from the uploadId', () => {
    const c = build('v.mp4', 3);
    expect(c[0]).toBe(`split -b 52428800 -a 3 'v.mp4' jeu_3f2b8c1e_`);
    expect(c[1]).toBe(
      `curl -sS --fail-with-body -X POST '${BASE}/0' -H 'X-Upload-Token: T' -F 'chunk=@jeu_3f2b8c1e_aaa'`,
    );
    expect(c[3]).toContain(`/chunks/2'`);
    expect(c[3]).toContain(`jeu_3f2b8c1e_aac`);
    expect(c[4]).toBe('rm -f jeu_3f2b8c1e_*');
    expect(c).toHaveLength(5);
  });

  it('keeps a hostile file name as one shell argument and one curl file name', () => {
    const [cmd] = build(`a'; rm -rf ~; '.mp4`, 1);
    expect(cmd).toBe(
      `curl -sS --fail-with-body -X POST '${BASE}/0' -H 'X-Upload-Token: T' -F 'chunk=@"a'\\''; rm -rf ~; '\\''.mp4"'`,
    );
  });

  it('escapes a double quote inside the curl file name', () => {
    expect(build('a"b.mp4', 1)[0]).toContain(`-F 'chunk=@"a\\"b.mp4"'`);
  });

  it('keeps a file name that starts with - from being read as an option', () => {
    expect(build('-rf.mp4', 1)[0]).toContain(`-F 'chunk=@./-rf.mp4'`);
    expect(build('-rf.mp4', 2)[0]).toBe(`split -b 52428800 -a 3 './-rf.mp4' jeu_3f2b8c1e_`);
  });
});
