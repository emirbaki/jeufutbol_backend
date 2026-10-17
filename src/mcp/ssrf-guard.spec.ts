import dns from 'node:dns';
import { assertAllowedUrl, isBlockedAddress, safeLookup } from './ssrf-guard';
import { McpToolError } from './mcp-tool';

describe('ssrf-guard', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '0.0.0.0',
    '::1',
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.1',
    '::ffff:7f00:1',
    '::ffff:a9fe:a9fe',
    'fc00::1',
    'fd12::1',
    'fe80::1',
    '::',
  ])('blocks %s', (ip) => expect(isBlockedAddress(ip)).toBe(true));

  it.each(['8.8.8.8', '172.32.0.1', '2606:4700::1111', '::ffff:8.8.8.8'])(
    'allows %s',
    (ip) => expect(isBlockedAddress(ip)).toBe(false),
  );

  it('blocks a value that is not an IP address', () =>
    expect(isBlockedAddress('nope')).toBe(true));

  it.each([
    'http://example.com/v.mp4',
    'ftp://example.com/v.mp4',
    'https://127.0.0.1/v.mp4',
    'https://[::ffff:7f00:1]/v.mp4',
    'https://[::ffff:127.0.0.1]/v.mp4',
    'https://[::1]/v.mp4',
    'https://0x7f.1/v.mp4',
    'https://2130706433/v.mp4',
    'https://localhost/v.mp4',
    'https://LOCALHOST./v.mp4',
    'https://a.localhost/v.mp4',
    'https://user:pw@example.com/v.mp4',
    'not a url',
  ])('rejects %s', (u) =>
    expect(() => assertAllowedUrl(u)).toThrow(McpToolError),
  );

  it('allows a public https URL', () =>
    expect(assertAllowedUrl('https://cdn.example.com/v.mp4').hostname).toBe(
      'cdn.example.com',
    ));

  it('safeLookup rejects a host that resolves to a private IP', (done) => {
    jest
      .spyOn(dns, 'lookup')
      .mockImplementation(((h, o, cb: any) =>
        cb(null, [{ address: '10.0.0.5', family: 4 }])) as any);
    safeLookup('evil.example.com', {}, (err) => {
      expect(err?.message).toContain('private');
      done();
    });
  });

  it('safeLookup rejects a host when one of its addresses is private', (done) => {
    jest.spyOn(dns, 'lookup').mockImplementation(((h, o, cb: any) =>
      cb(null, [
        { address: '93.184.216.34', family: 4 },
        { address: '::1', family: 6 },
      ])) as any);
    safeLookup('mixed.example.com', {}, (err) => {
      expect(err?.message).toContain('private');
      done();
    });
  });

  it('safeLookup gives a public IP', (done) => {
    jest
      .spyOn(dns, 'lookup')
      .mockImplementation(((h, o, cb: any) =>
        cb(null, [{ address: '93.184.216.34', family: 4 }])) as any);
    safeLookup('example.com', {}, (err, address, family) => {
      expect(err).toBeNull();
      expect(address).toBe('93.184.216.34');
      expect(family).toBe(4);
      done();
    });
  });

  it('safeLookup gives all addresses when the caller asks for all', (done) => {
    const list = [{ address: '93.184.216.34', family: 4 }];
    jest
      .spyOn(dns, 'lookup')
      .mockImplementation(((h, o, cb: any) => cb(null, list)) as any);
    safeLookup('example.com', { all: true }, (err, addresses) => {
      expect(err).toBeNull();
      expect(addresses).toEqual(list);
      done();
    });
  });
});
