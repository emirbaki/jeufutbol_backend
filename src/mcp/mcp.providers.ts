import { Provider, Type } from '@nestjs/common';
import { McpController } from './mcp.controller';
import { McpUploadController } from './mcp-upload.controller';
import { McpServerFactory } from './mcp-server.factory';
import { MCP_TOOL_GROUPS, McpToolGroup } from './mcp-tool';
import { UploadTokenService } from './upload-token.service';
import { MediaImportProcessor } from './processors/media-import.processor';
import { JobToolsGroup } from './tools/jobs.tools';
import { MediaToolsGroup } from './tools/media.tools';
import { AccountToolsGroup } from './tools/accounts.tools';
import { PostToolsGroup } from './tools/posts.tools';
import { AiToolsGroup } from './tools/ai.tools';

export const MCP_CONTROLLERS: Type[] = [McpController, McpUploadController];

/** Add each tool group class to this list only. It feeds the providers and the MCP_TOOL_GROUPS inject list. */
const TOOL_GROUP_CLASSES: Type<McpToolGroup>[] = [
  JobToolsGroup,
  MediaToolsGroup,
  AccountToolsGroup,
  PostToolsGroup,
  AiToolsGroup,
];

export const MCP_PROVIDERS: Provider[] = [
  McpServerFactory,
  UploadTokenService,
  MediaImportProcessor,
  ...TOOL_GROUP_CLASSES,
  {
    provide: MCP_TOOL_GROUPS,
    useFactory: (...groups: McpToolGroup[]) => groups,
    inject: TOOL_GROUP_CLASSES,
  },
];
