import { Controller, Delete, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CombinedAuthGuard } from '../auth/guards/combined-auth.guard';
import { buildMcpAuthContext } from './mcp-auth.context';
import { McpServerFactory } from './mcp-server.factory';

/** Stateless MCP endpoint (Streamable HTTP, JSON responses). One server per request. */
@Controller('mcp')
@UseGuards(CombinedAuthGuard)
export class McpController {
  constructor(
    private readonly serverFactory: McpServerFactory,
    private readonly config: ConfigService,
  ) {}

  @Post()
  async handle(@Req() req: Request, @Res() res: Response): Promise<void> {
    const ctx = buildMcpAuthContext(req as any, this.apiBaseUrl(req));
    const server = this.serverFactory.create(ctx);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    res.on('close', () => {
      void transport.close();
      void server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }

  @Get()
  methodNotAllowed(@Res() res: Response): void {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed.' },
      id: null,
    });
  }

  // Nest keeps only one route decorator per method, so DELETE needs its own handler.
  @Delete()
  methodNotAllowedDelete(@Res() res: Response): void {
    this.methodNotAllowed(res);
  }

  private apiBaseUrl(req: Request): string {
    const configured = this.config.get<string>('PUBLIC_API_URL');
    if (configured) {
      return configured;
    }
    const forwarded = req.headers['x-forwarded-proto'];
    const proto = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0].trim() || req.protocol;
    return `${proto}://${req.get('host')}/api`;
  }
}
