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

@Resolver()
@UseGuards(CombinedAuthGuard, ApiKeyScopeGuard)
export class CredentialsResolver {
  constructor(
    private credentialsService: CredentialsService,
    private workspacesService: WorkspacesService,
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
    return this.credentialsService.moveCredential(credential, workspaceId);
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

  /** The X-Workspace-Id header filters the list. Without it, the list has all accounts. */
  private async headerWorkspaceId(tenantId: string, ctx?: ActiveWorkspaceContext): Promise<string | undefined> {
    if (!ctx?.headerRef) return undefined;
    return (await this.workspacesService.resolveActive(tenantId, { headerRef: ctx.headerRef })).id;
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
