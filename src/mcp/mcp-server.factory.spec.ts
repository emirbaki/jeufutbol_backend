import { Logger } from '@nestjs/common';
import { z } from 'zod/v4';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpServerFactory } from './mcp-server.factory';
import { McpToolDef } from './mcp-tool';
import { McpAuthContext } from './mcp-auth.context';

const tool = (name: string, scopes: string[]): McpToolDef => ({
  name,
  title: name,
  description: `tool ${name}`,
  scopes,
  inputSchema: z.object({ n: z.number() }),
  handler: async (args) => ({ got: args.n }),
});

const ctxWith = (isUser: boolean, scopes: string[]): McpAuthContext => ({
  userId: 'u1',
  tenantId: 't1',
  grant: { isUser, scopes },
  keyPrefix: 'jeu_ab',
  apiBaseUrl: 'https://x/api',
});

const groups = [
  { tools: () => [tool('read_x', ['posts:read']), tool('write_x', ['posts:write']), tool('any_x', [])] },
];

async function connect(server: McpServer): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe('McpServerFactory', () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const notAvailable = (name: string) =>
    `Tool ${name} is not available for this API key. Call tools/list to see the tools you can use.`;

  it('lists only the tools that the scopes allow', async () => {
    const client = await connect(new McpServerFactory(groups).create(ctxWith(false, ['posts:read'])));
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(['any_x', 'read_x']);
    await client.close();
  });

  it('lists all tools for a user', async () => {
    const client = await connect(new McpServerFactory(groups).create(ctxWith(true, [])));
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(['any_x', 'read_x', 'write_x']);
    await client.close();
  });

  it('runs a tool call through runTool', async () => {
    const client = await connect(new McpServerFactory(groups).create(ctxWith(true, [])));
    const r: any = await client.callTool({ name: 'any_x', arguments: { n: 3 } });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(r.content[0].text)).toEqual({ got: 3 });
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toMatch(/tool=any_x tenant=t1 key=jeu_ab ms=\d+ result=ok/);
    await client.close();
  });

  it('maps bad arguments with runTool and writes one error log line', async () => {
    const client = await connect(new McpServerFactory(groups).create(ctxWith(true, [])));
    const r: any = await client.callTool({ name: 'any_x', arguments: { n: 'x' } });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/^n: /);
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toMatch(/tool=any_x tenant=t1 key=jeu_ab ms=\d+ result=error/);
    await client.close();
  });

  it('rejects a call to a tool that the scopes do not allow and logs it', async () => {
    const handler = jest.fn();
    const guarded = [{ tools: () => [{ ...tool('write_x', ['posts:write']), handler }] }];
    const client = await connect(new McpServerFactory(guarded).create(ctxWith(false, ['posts:read'])));
    const r: any = await client.callTool({ name: 'write_x', arguments: { n: 1 } });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toBe(notAvailable('write_x'));
    expect(handler).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toMatch(/tool=write_x tenant=t1 key=jeu_ab ms=\d+ result=error/);
    await client.close();
  });

  it('rejects a call to an unknown tool', async () => {
    const client = await connect(new McpServerFactory(groups).create(ctxWith(true, [])));
    const r: any = await client.callTool({ name: 'no_such_tool', arguments: {} });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toBe(notAvailable('no_such_tool'));
    expect(logSpy).toHaveBeenCalledTimes(1);
    await client.close();
  });

  it('removes a newline from an unknown tool name before the log line', async () => {
    const client = await connect(new McpServerFactory(groups).create(ctxWith(true, [])));
    const r: any = await client.callTool({ name: 'bad\ntool=x result=ok', arguments: {} });
    expect(r.content[0].text).toBe(notAvailable('badtoolxresultok'));
    expect(logSpy.mock.calls[0][0]).toMatch(/^tool=badtoolxresultok tenant=t1 /);
    await client.close();
  });
});
