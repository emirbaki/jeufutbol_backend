import { Provider, Type } from '@nestjs/common';
import { McpController } from './mcp.controller';
import { McpServerFactory } from './mcp-server.factory';
import { MCP_TOOL_GROUPS, McpToolGroup } from './mcp-tool';
import { JobToolsGroup } from './tools/jobs.tools';

export const MCP_CONTROLLERS: Type[] = [McpController];

/** Add each tool group class to this list only. It feeds the providers and the MCP_TOOL_GROUPS inject list. */
const TOOL_GROUP_CLASSES: Type<McpToolGroup>[] = [JobToolsGroup];

export const MCP_PROVIDERS: Provider[] = [
  McpServerFactory,
  ...TOOL_GROUP_CLASSES,
  {
    provide: MCP_TOOL_GROUPS,
    useFactory: (...groups: McpToolGroup[]) => groups,
    inject: TOOL_GROUP_CLASSES,
  },
];
