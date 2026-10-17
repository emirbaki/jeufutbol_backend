import { buildUploadCommands, shellQuote, splitSuffix } from './upload-commands';

describe('upload commands', () => {
  it('quotes shell characters', () => {
    expect(shellQuote(`a'; rm -rf ~; '.mp4`)).toBe(`'a'\\''; rm -rf ~; '\\''.mp4'`);
  });

  it('makes split suffixes', () => {
    expect([0, 1, 25, 26, 675].map(splitSuffix)).toEqual(['aaa', 'aab', 'aaz', 'aba', 'azz']);
  });

  it('gives one curl command for one chunk', () => {
    const c = buildUploadCommands({ chunkUrlBase: 'https://x/api/mcp/uploads/u1/chunks', token: 'T', filename: 'my video.mp4', totalChunks: 1 });
    expect(c).toEqual([`curl -sf -X POST 'https://x/api/mcp/uploads/u1/chunks/0' -H 'X-Upload-Token: T' -F 'chunk=@my video.mp4'`]);
  });

  it('gives split, one curl for each chunk, and cleanup for more chunks', () => {
    const c = buildUploadCommands({ chunkUrlBase: 'https://x/api/mcp/uploads/u1/chunks', token: 'T', filename: 'v.mp4', totalChunks: 3 });
    expect(c[0]).toBe(`split -b 52428800 -a 3 'v.mp4' jeu_part_`);
    expect(c[1]).toContain(`/chunks/0' -H 'X-Upload-Token: T' -F 'chunk=@jeu_part_aaa'`);
    expect(c[3]).toContain(`/chunks/2'`);
    expect(c[3]).toContain(`jeu_part_aac`);
    expect(c[4]).toBe('rm -f jeu_part_*');
    expect(c).toHaveLength(5);
  });

  it('keeps a hostile file name as one shell argument and one curl file name', () => {
    const [cmd] = buildUploadCommands({ chunkUrlBase: 'https://x/c', token: 'T', filename: `a'; rm -rf ~; '.mp4`, totalChunks: 1 });
    expect(cmd).toBe(`curl -sf -X POST 'https://x/c/0' -H 'X-Upload-Token: T' -F 'chunk=@"a'\\''; rm -rf ~; '\\''.mp4"'`);
  });

  it('escapes a double quote inside the curl file name', () => {
    const [cmd] = buildUploadCommands({ chunkUrlBase: 'https://x/c', token: 'T', filename: 'a"b.mp4', totalChunks: 1 });
    expect(cmd).toContain(`-F 'chunk=@"a\\"b.mp4"'`);
  });

  it('keeps a file name that starts with - from being read as an option', () => {
    const one = buildUploadCommands({ chunkUrlBase: 'https://x/c', token: 'T', filename: '-rf.mp4', totalChunks: 1 });
    expect(one[0]).toContain(`-F 'chunk=@./-rf.mp4'`);
    const many = buildUploadCommands({ chunkUrlBase: 'https://x/c', token: 'T', filename: '-rf.mp4', totalChunks: 2 });
    expect(many[0]).toBe(`split -b 52428800 -a 3 './-rf.mp4' jeu_part_`);
  });
});
