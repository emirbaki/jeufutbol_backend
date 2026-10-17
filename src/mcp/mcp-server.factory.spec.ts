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
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

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
    await client.close();
  });
});
