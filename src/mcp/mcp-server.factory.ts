import { Inject, Injectable, Logger } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolRequestSchema, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { hasScopes } from '../auth/scope.utils';
import { MCP_TOOL_GROUPS, McpToolDef, McpToolGroup } from './mcp-tool';
import { McpAuthContext } from './mcp-auth.context';
import { runTool } from './run-tool';

@Injectable()
export class McpServerFactory {
  private readonly logger = new Logger('McpTools');

  constructor(@Inject(MCP_TOOL_GROUPS) private readonly groups: McpToolGroup[]) {}

  /** Makes a new server for one request. Tools that the caller scopes do not allow are disabled. */
  create(ctx: McpAuthContext): McpServer {
    const server = new McpServer({ name: 'jeuhub', version: '1.0.0' });
    const defs = new Map<string, McpToolDef>();

    for (const group of this.groups) {
      for (const def of group.tools()) {
        defs.set(def.name, def);
        // registerTool gives tools/list the JSON schema. The call handler below replaces the SDK dispatch.
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

    // The SDK handler checks the arguments before our callback runs. Then runTool cannot map
    // the error or write the log line. This handler replaces it (Protocol keeps one handler per method).
    server.server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
      const name = request.params.name;
      const def = defs.get(name);
      if (!def || !hasScopes(ctx.grant, def.scopes)) {
        this.logger.log(
          `tool=${name} tenant=${ctx.tenantId} key=${ctx.keyPrefix} ms=0 result=error`,
        );
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Tool ${name} is not available for this API key. Call tools/list to see the tools you can use.`,
            },
          ],
        };
      }
      return runTool(def, request.params.arguments ?? {}, ctx, this.logger);
    });

    return server;
  }
}
