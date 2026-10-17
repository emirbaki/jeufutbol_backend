import { z } from 'zod/v4';
import { McpAuthContext } from './mcp-auth.context';

/** An error whose message is safe to show to the MCP client. */
export class McpToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'McpToolError';
  }
}

export interface McpToolDef {
  name: string;
  title: string;
  description: string;
  /** The API key scopes that the tool needs. [] means any valid caller. */
  scopes: string[];
  /** The SDK gets `.shape`. runTool parses the full schema. */
  inputSchema: z.ZodObject<any>;
  handler: (args: any, ctx: McpAuthContext) => Promise<unknown>;
}

export interface McpToolGroup {
  tools(): McpToolDef[];
}

export const MCP_TOOL_GROUPS = 'MCP_TOOL_GROUPS';
