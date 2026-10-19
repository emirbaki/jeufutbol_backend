import { Injectable } from '@nestjs/common';
import { z } from 'zod/v4';
import { CredentialsService } from '../../credentials/credential.service';
import { Credential, PlatformName } from '../../entities/credential.entity';
import { PostsService } from '../../post/post.service';
import { WorkspacesService } from '../../workspaces/workspaces.service';
import { reaches } from '../../workspaces/workspace-access.service';
import { McpToolDef, McpToolGroup } from '../mcp-tool';
import { McpAuthContext } from '../mcp-auth.context';
import { platformSchema, workspaceRefSchema } from '../schemas/post.schemas';

type TokenState = 'valid' | 'expired' | 'unknown';

function tokenState(expiresAt: Date | null): TokenState {
  if (!expiresAt) return 'unknown';
  return new Date(expiresAt).getTime() > Date.now() ? 'valid' : 'expired';
}

const listAccountsSchema = z.object({
  platform: platformSchema.optional(),
  workspace: workspaceRefSchema.optional(),
});
const workspaceOnlySchema = z.object({ workspace: workspaceRefSchema.optional() });

@Injectable()
export class AccountToolsGroup implements McpToolGroup {
  constructor(
    private readonly credentialsService: CredentialsService,
    private readonly postsService: PostsService,
    private readonly workspacesService: WorkspacesService,
  ) {}

  tools(): McpToolDef[] {
    return [
      {
        name: 'list_workspaces',
        title: 'List workspaces',
        description:
          'List the workspaces (branches, for example Football or Cinema) and the number of connected accounts in each one.',
        scopes: ['credentials:read'],
        inputSchema: z.object({}),
        handler: (_args: unknown, ctx: McpAuthContext) => this.listWorkspaces(ctx),
      },
      {
        name: 'list_connected_accounts',
        title: 'List connected accounts',
        description:
          'List the connected social accounts and their workspace. Call this first, and only post to platforms in this list.',
        scopes: ['credentials:read'],
        inputSchema: listAccountsSchema,
        handler: (args: z.infer<typeof listAccountsSchema>, ctx: McpAuthContext) => this.listAccounts(args, ctx),
      },
      {
        name: 'get_tiktok_creator_info',
        title: 'Get TikTok creator info',
        description:
          'Get the TikTok privacy options and posting limits of the TikTok account in the workspace. Call this before each TikTok post, and use one of the returned privacy levels.',
        scopes: ['posts:read'],
        inputSchema: workspaceOnlySchema,
        handler: async (args: z.infer<typeof workspaceOnlySchema>, ctx: McpAuthContext) => {
          const workspace = await this.workspacesService.resolve(
            ctx.tenantId,
            args.workspace ?? ctx.defaultWorkspaceId ?? undefined,
            ctx.access,
          );
          return this.postsService.getTikTokCreatorInfo(ctx.userId, ctx.tenantId, workspace.id);
        },
      },
    ];
  }

  private async listWorkspaces(ctx: McpAuthContext) {
    const [workspaces, credentials] = await Promise.all([
      this.workspacesService.list(ctx.tenantId, ctx.access),
      this.credentialsService.listCredentials(ctx.tenantId),
    ]);
    const counts = new Map<string, number>();
    for (const c of credentials) {
      if (c.workspaceId) counts.set(c.workspaceId, (counts.get(c.workspaceId) ?? 0) + 1);
    }
    return {
      workspaces: workspaces.map((w) => ({
        workspace: w.slug,
        name: w.name,
        isDefault: w.isDefault,
        accountCount: counts.get(w.id) ?? 0,
      })),
      next: 'Pass the workspace value to list_connected_accounts and create_post.',
    };
  }

  private async listAccounts(args: z.infer<typeof listAccountsSchema>, ctx: McpAuthContext) {
    const platform = args.platform as PlatformName | undefined;
    const workspaces = await this.workspacesService.list(ctx.tenantId, ctx.access);
    const workspaceId = args.workspace
      ? (await this.workspacesService.resolve(ctx.tenantId, args.workspace, ctx.access)).id
      : undefined;
    const credentials: Credential[] = await this.credentialsService.listCredentials(ctx.tenantId, {
      workspaceId,
      platform,
    });
    const slugs = new Map(workspaces.map((w) => [w.id, w.slug]));
    const defaultSlugId = workspaces.find((w) => w.isDefault)?.id;
    const defaultSlug = workspaces.find((w) => w.isDefault)?.slug ?? null;
    // Hide the accounts of branches the caller cannot reach.
    const visible = credentials.filter((c) => reaches(ctx.access, c.workspaceId ?? defaultSlugId));
    const accounts = visible.map((c) => ({
      credentialId: c.id,
      platform: c.platform,
      accountName: c.accountName,
      workspace: (c.workspaceId && slugs.get(c.workspaceId)) || defaultSlug,
      tokenState: tokenState(c.tokenExpiresAt),
    }));
    return {
      accounts,
      next: accounts.length
        ? 'Use these platform names in create_post targetPlatforms, and the workspace value in create_post workspace.'
        : 'No accounts are connected. Connect one in JeuHub Settings.',
    };
  }
}
