import dns from 'node:dns';
import net from 'node:net';
import { McpToolError } from './mcp-tool';

export const PRIVATE_ADDRESS_MESSAGE =
  'The URL points to a private or local address. Use a public https URL.';

const blockList = new net.BlockList();
for (const [prefix, bits] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
] as const) {
  blockList.addSubnet(prefix, bits, 'ipv4');
}
for (const [prefix, bits] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
] as const) {
  blockList.addSubnet(prefix, bits, 'ipv6');
}

/** Expand a valid IPv6 address (without a zone) to its 8 groups of 16 bits. */
function ipv6Groups(ip: string): number[] {
  let text = ip;
  // A dotted IPv4 tail, as in ::ffff:127.0.0.1, is two groups.
  const dotted = /^(.*:)(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (dotted) {
    const [a, b, c, d] = dotted.slice(2).map(Number);
    text = `${dotted[1]}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail] = text.split('::');
  const headGroups = head ? head.split(':') : [];
  const tailGroups = tail === undefined ? [] : tail ? tail.split(':') : [];
  const zeros =
    tail === undefined
      ? []
      : Array<string>(8 - headGroups.length - tailGroups.length).fill('0');
  return [...headGroups, ...zeros, ...tailGroups].map((g) => parseInt(g, 16));
}

/** The IPv4 part of an IPv4-mapped IPv6 address (::ffff:a.b.c.d), or null. */
function mappedIpv4(ip: string): string | null {
  const g = ipv6Groups(ip);
  if (g.slice(0, 5).some((x) => x !== 0) || g[5] !== 0xffff) return null;
  return [g[6] >> 8, g[6] & 0xff, g[7] >> 8, g[7] & 0xff].join('.');
}

/** True for a private, loopback, link-local, unspecified or metadata address. A value that is not an IP is blocked. */
export function isBlockedAddress(ip: string): boolean {
  const address = ip.toLowerCase().split('%')[0];
  const version = net.isIP(address);
  if (version === 4) return blockList.check(address, 'ipv4');
  if (version === 6) {
    const v4 = mappedIpv4(address);
    return v4 ? blockList.check(v4, 'ipv4') : blockList.check(address, 'ipv6');
  }
  return true;
}

/** Parse the URL and throw an McpToolError unless it is a public https URL. */
export function assertAllowedUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new McpToolError(
      'The URL is not valid. Give a full public https URL, for example https://cdn.example.com/video.mp4.',
    );
  }
  if (url.protocol !== 'https:') {
    throw new McpToolError(
      `The URL uses ${url.protocol} and only https: is allowed. Use a public https URL.`,
    );
  }
  if (url.username || url.password) {
    throw new McpToolError(
      'The URL contains a user name or password, which is not allowed. Use a public https URL without them.',
    );
  }
  // The URL parser lowercases the host and turns forms such as 0x7f.1 into 127.0.0.1.
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost')) {
    throw new McpToolError(PRIVATE_ADDRESS_MESSAGE);
  }
  // Node does not call lookup for an IP literal, so check it here.
  if (net.isIP(host) && isBlockedAddress(host)) {
    throw new McpToolError(PRIVATE_ADDRESS_MESSAGE);
  }
  return url;
}

/** A dns lookup for http agents that fails when any address of the host is blocked. */
export function safeLookup(
  hostname: string,
  options: dns.LookupOptions,
  cb: (
    err: NodeJS.ErrnoException | null,
    address: string | dns.LookupAddress[],
    family?: number,
  ) => void,
): void {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return cb(err, '', undefined);
    if (!addresses.length) {
      return cb(
        Object.assign(new Error(`No address found for ${hostname}.`), {
          code: 'ENOTFOUND',
        }),
        '',
        undefined,
      );
    }
    if (addresses.some((a) => isBlockedAddress(a.address))) {
      return cb(new McpToolError(PRIVATE_ADDRESS_MESSAGE), '', undefined);
    }
    if (options.all) return cb(null, addresses);
    cb(null, addresses[0].address, addresses[0].family);
  });
}
