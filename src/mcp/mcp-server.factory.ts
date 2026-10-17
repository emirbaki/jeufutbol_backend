import { Inject, Injectable, Logger } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { hasScopes } from '../auth/scope.utils';
import { MCP_TOOL_GROUPS, McpToolGroup } from './mcp-tool';
import { McpAuthContext } from './mcp-auth.context';
import { runTool } from './run-tool';

@Injectable()
export class McpServerFactory {
  private readonly logger = new Logger('McpTools');

  constructor(@Inject(MCP_TOOL_GROUPS) private readonly groups: McpToolGroup[]) {}

  /** Makes a new server for one request. Tools that the caller scopes do not allow are disabled. */
  create(ctx: McpAuthContext): McpServer {
    const server = new McpServer({ name: 'jeuhub', version: '1.0.0' });

    for (const group of this.groups) {
      for (const def of group.tools()) {
        const registered = server.registerTool(
          def.name,
          { title: def.title, description: def.description, inputSchema: def.inputSchema.shape },
          (args: unknown) => runTool(def, args, ctx, this.logger),
        );
        if (!hasScopes(ctx.grant, def.scopes)) {
          registered.disable();
        }
      }
    }

    return server;
  }
}
