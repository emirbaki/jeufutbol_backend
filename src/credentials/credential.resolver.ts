import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { NotFoundException, UseGuards } from '@nestjs/common';
import { CredentialsService } from './credential.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { Credential } from '../entities/credential.entity';
import { CombinedAuthGuard } from '../auth/guards/combined-auth.guard';
import { ApiKeyScopeGuard } from '../auth/guards/api-key-scope.guard';
import { RequireScopes } from '../auth/decorators/require-scopes.decorator';
import { ApiKeyScope } from '../auth/api-key-scopes.enum';
import { CurrentApiKey } from '../auth/decorators/current-api-key.decorator';
import { ApiKey } from '../entities/api-key.entity';
import { assertCanManageCredential } from './credential-access';
import { ActiveWorkspaceContext, ActiveWorkspaceContextParam } from '../workspaces/active-workspace.decorator';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { WorkspaceAccessService } from '../workspaces/workspace-access.service';

@Resolver()
@UseGuards(CombinedAuthGuard, ApiKeyScopeGuard)
export class CredentialsResolver {
  constructor(
    private credentialsService: CredentialsService,
    private workspacesService: WorkspacesService,
    private accessService: WorkspaceAccessService,
  ) { }

  @Query(() => [Credential])
  @RequireScopes(ApiKeyScope.CREDENTIALS_READ)
  async getCredentials(
    @CurrentUser() user: User,
    @CurrentApiKey() apiKey: ApiKey,
    @Args('platform', { nullable: true }) platform?: string,
    @ActiveWorkspaceContextParam() workspaceCtx?: ActiveWorkspaceContext,
  ) {
    const tenantId = this.tenantOf(user, apiKey);
    return this.credentialsService.listCredentials(tenantId, {
      workspaceId: await this.headerWorkspaceId(tenantId, workspaceCtx),
      platform: platform as any,
    });
  }

  @Query(() => [Credential])
  @RequireScopes(ApiKeyScope.CREDENTIALS_READ)
  async getConnectedAccounts(
    @CurrentUser() user: User,
    @CurrentApiKey() apiKey: ApiKey,
    @ActiveWorkspaceContextParam() workspaceCtx?: ActiveWorkspaceContext,
  ) {
    const tenantId = this.tenantOf(user, apiKey);
    return this.credentialsService.listCredentials(tenantId, {
      workspaceId: await this.headerWorkspaceId(tenantId, workspaceCtx),
    });
  }

  @Mutation(() => Boolean)
  @RequireScopes(ApiKeyScope.CREDENTIALS_WRITE)
  async deleteCredential(
    @CurrentUser() user: User,
    @CurrentApiKey() apiKey: ApiKey,
    @Args('credentialId') credentialId: string,
  ) {
    const tenantId = this.tenantOf(user, apiKey);
    await this.loadManageable(credentialId, tenantId, user);
    await this.credentialsService.deleteCredential(credentialId, tenantId);
    return true;
  }

  @Mutation(() => Credential)
  @RequireScopes(ApiKeyScope.CREDENTIALS_WRITE)
  async moveCredentialToWorkspace(
    @CurrentUser() user: User,
    @CurrentApiKey() apiKey: ApiKey,
    @Args('credentialId', { type: () => ID }) credentialId: string,
    @Args('workspaceId', { type: () => ID }) workspaceId: string,
  ) {
    const tenantId = this.tenantOf(user, apiKey);
    const credential = await this.loadManageable(credentialId, tenantId, user);
    // The target branch must be one the caller can reach.
    const access = await this.accessService.accessFor(user, apiKey);
    const target = await this.workspacesService.resolve(tenantId, workspaceId, access);
    return this.credentialsService.moveCredential(credential, target.id);
  }

  @Mutation(() => Boolean)
  @RequireScopes(ApiKeyScope.CREDENTIALS_READ) // Testing connection is read-like, or maybe write? Let's say READ as it doesn't modify data usually
  async testCredential(
    @CurrentUser() user: User,
    @CurrentApiKey() apiKey: ApiKey,
    @Args('credentialId') credentialId: string,
  ) {
    return this.credentialsService.testConnection(
      credentialId,
      this.tenantOf(user, apiKey),
    );
  }

  /**
   * The X-Workspace-Id header filters the list. Without it, a caller with
   * access to all branches gets all accounts, and any other caller gets
   * the accounts of their active branch.
   */
  private async headerWorkspaceId(tenantId: string, ctx?: ActiveWorkspaceContext): Promise<string | undefined> {
    const access = await this.accessService.accessFor(ctx?.user, ctx?.apiKey);
    if (!ctx?.headerRef && access === 'all') return undefined;
    return (
      await this.workspacesService.resolveActive(tenantId, {
        headerRef: ctx?.headerRef,
        user: ctx?.user,
        apiKey: ctx?.apiKey,
        access,
      })
    ).id;
  }

  private tenantOf(user?: User, apiKey?: ApiKey): string {
    const tenantId = user?.tenantId || apiKey?.tenantId;
    if (!tenantId) throw new Error('Tenant context required');
    return tenantId;
  }

  private async loadManageable(credentialId: string, tenantId: string, user?: User): Promise<Credential> {
    const credential = await this.credentialsService.getCredential(credentialId, tenantId);
    if (!credential) throw new NotFoundException('Account not found.');
    assertCanManageCredential(user, credential);
    return credential;
  }
}
