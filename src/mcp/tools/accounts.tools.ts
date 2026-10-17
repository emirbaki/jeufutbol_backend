import { Injectable } from '@nestjs/common';
import { z } from 'zod/v4';
import { CredentialsService } from '../../credentials/credential.service';
import { Credential, PlatformName } from '../../entities/credential.entity';
import { PostsService } from '../../post/post.service';
import { McpToolDef, McpToolGroup } from '../mcp-tool';
import { McpAuthContext } from '../mcp-auth.context';
import { platformSchema } from '../schemas/post.schemas';

type TokenState = 'valid' | 'expired' | 'unknown';

function tokenState(expiresAt: Date | null): TokenState {
  if (!expiresAt) return 'unknown';
  return new Date(expiresAt).getTime() > Date.now() ? 'valid' : 'expired';
}

@Injectable()
export class AccountToolsGroup implements McpToolGroup {
  constructor(
    private readonly credentialsService: CredentialsService,
    private readonly postsService: PostsService,
  ) {}

  tools(): McpToolDef[] {
    return [
      {
        name: 'list_connected_accounts',
        title: 'List connected accounts',
        description:
          'List the connected social accounts. Call this first, and only post to platforms in this list.',
        scopes: ['credentials:read'],
        inputSchema: z.object({ platform: platformSchema.optional() }),
        handler: (args: { platform?: PlatformName }, ctx: McpAuthContext) => this.listAccounts(args.platform, ctx),
      },
      {
        name: 'get_tiktok_creator_info',
        title: 'Get TikTok creator info',
        description:
          'Get the TikTok privacy options and posting limits. Call this before each TikTok post, and use one of the returned privacy levels.',
        scopes: ['posts:read'],
        inputSchema: z.object({}),
        handler: (_args: unknown, ctx: McpAuthContext) =>
          this.postsService.getTikTokCreatorInfo(ctx.userId, ctx.tenantId),
      },
    ];
  }

  private async listAccounts(platform: PlatformName | undefined, ctx: McpAuthContext) {
    const credentials: Credential[] = await this.credentialsService.getUserCredentials(
      ctx.userId,
      ctx.tenantId,
      platform,
    );
    const accounts = credentials.map((c) => ({
      credentialId: c.id,
      platform: c.platform,
      accountName: c.accountName,
      tokenState: tokenState(c.tokenExpiresAt),
    }));
    return {
      accounts,
      next: accounts.length
        ? 'Use these platform names in create_post targetPlatforms.'
        : 'No accounts are connected. Connect one in JeuHub Settings.',
    };
  }
}
