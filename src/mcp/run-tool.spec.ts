import { BadRequestException } from '@nestjs/common';
import { z } from 'zod/v4';
import { runTool } from './run-tool';
import { McpToolError } from './mcp-tool';
import { McpAuthContext } from './mcp-auth.context';

const ctx: McpAuthContext = {
  userId: 'u1',
  tenantId: 't1',
  grant: { isUser: false, scopes: [] },
  keyPrefix: 'jeu_ab',
  apiBaseUrl: 'https://x/api',
  access: 'all',
};

const def = (handler: (args: any) => Promise<unknown>) => ({
  name: 't',
  title: 'T',
  description: 'd',
  scopes: [],
  inputSchema: z.object({ n: z.number() }),
  handler,
});

describe('runTool', () => {
  let logger: { log: jest.Mock; error: jest.Mock };

  beforeEach(() => {
    logger = { log: jest.fn(), error: jest.fn() };
  });

  it('returns the result as JSON text', async () => {
    const r = await runTool(def(async () => ({ ok: 1 })), { n: 1 }, ctx, logger as any);
    expect(r.isError).toBeFalsy();
    expect(JSON.parse((r.content[0] as any).text)).toEqual({ ok: 1 });
  });

  it('passes the parsed arguments and the context to the handler', async () => {
    const handler = jest.fn().mockResolvedValue(null);
    await runTool(def(handler), { n: 2 }, ctx, logger as any);
    expect(handler).toHaveBeenCalledWith({ n: 2 }, ctx);
  });

  it('maps a zod error to the field path', async () => {
    const r = await runTool(def(async () => 1), { n: 'x' }, ctx, logger as any);
    expect(r.isError).toBe(true);
    expect((r.content[0] as any).text).toContain('n:');
  });

  it('shows the text of McpToolError, HttpException and a plain Error', async () => {
    for (const e of [new McpToolError('A'), new BadRequestException('B'), new Error('C')]) {
      const r = await runTool(
        def(async () => {
          throw e;
        }),
        { n: 1 },
        ctx,
        logger as any,
      );
      expect(r.isError).toBe(true);
      expect((r.content[0] as any).text).toBe(e.message);
    }
  });

  it('hides the text of other errors', async () => {
    const r = await runTool(
      def(async () => {
        throw new TypeError('secret db detail');
      }),
      { n: 1 },
      ctx,
      logger as any,
    );
    expect(r.isError).toBe(true);
    const text: string = (r.content[0] as any).text;
    expect(text).toMatch(/^Internal error\. Reference: [0-9a-f-]{36}\.$/);
    const ref = /Reference: ([0-9a-f-]{36})/.exec(text)![1];
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(ref), expect.any(String));
  });

  it('writes one log line with no arguments', async () => {
    await runTool(def(async () => 1), { n: 1 }, ctx, logger as any);
    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log.mock.calls[0][0]).toMatch(/tool=t tenant=t1 key=jeu_ab ms=\d+ result=ok/);
  });

  it('logs result=error for a failed call', async () => {
    await runTool(
      def(async () => {
        throw new Error('C');
      }),
      { n: 1 },
      ctx,
      logger as any,
    );
    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log.mock.calls[0][0]).toMatch(/result=error$/);
  });
});
