import { HttpException, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { z } from 'zod/v4';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { McpToolDef, McpToolError } from './mcp-tool';
import { McpAuthContext } from './mcp-auth.context';

/**
 * Parses the arguments, runs the tool handler and maps the outcome to an MCP result.
 * It writes one log line per call. The line has no arguments and no results.
 */
export async function runTool(
  def: McpToolDef,
  rawArgs: unknown,
  ctx: McpAuthContext,
  logger: Logger,
): Promise<CallToolResult> {
  const started = Date.now();
  let result: CallToolResult;

  try {
    const args = def.inputSchema.parse(rawArgs ?? {});
    const output = await def.handler(args, ctx);
    result = { content: [{ type: 'text', text: JSON.stringify(output ?? null) }] };
  } catch (err) {
    result = { isError: true, content: [{ type: 'text', text: errorText(def, err, logger) }] };
  }

  const ms = Date.now() - started;
  logger.log(
    `tool=${def.name} tenant=${ctx.tenantId} key=${ctx.keyPrefix} ms=${ms} result=${result.isError ? 'error' : 'ok'}`,
  );
  return result;
}

function errorText(def: McpToolDef, err: unknown, logger: Logger): string {
  if (err instanceof z.ZodError) {
    return err.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n');
  }
  if (err instanceof McpToolError || err instanceof HttpException) {
    return err.message;
  }
  if (err instanceof Error && err.constructor === Error) {
    return err.message;
  }
  const reference = randomUUID();
  const stack = err instanceof Error ? (err.stack ?? err.message) : String(err);
  logger.error(`tool=${def.name} reference=${reference} internal error`, stack);
  return `Internal error. Reference: ${reference}.`;
}
