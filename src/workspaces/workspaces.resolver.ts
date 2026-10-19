import { ForbiddenException, UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Workspace } from '../entities/workspace.entity';
import { User } from '../entities/user.entity';
import { ApiKey } from '../entities/api-key.entity';
import { CombinedAuthGuard } from '../auth/guards/combined-auth.guard';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { ApiKeyScopeGuard } from '../auth/guards/api-key-scope.guard';
import { RequireScopes } from '../auth/decorators/require-scopes.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentApiKey } from '../auth/decorators/current-api-key.decorator';
import { ApiKeyScope } from '../auth/api-key-scopes.enum';
import { UserRole } from '../auth/user-role.enum';
import { WorkspacesService } from './workspaces.service';
import { CreateWorkspaceInput, UpdateWorkspaceInput } from './workspace.inputs';
import { WorkspaceAccessService } from './workspace-access.service';

@Resolver(() => Workspace)
@UseGuards(CombinedAuthGuard, ApiKeyScopeGuard)
export class WorkspacesResolver {
  constructor(
    private readonly workspacesService: WorkspacesService,
    private readonly accessService: WorkspaceAccessService,
  ) {}

  @Query(() => [Workspace])
  @RequireScopes(ApiKeyScope.CREDENTIALS_READ)
  async workspaces(@CurrentUser() user?: User, @CurrentApiKey() apiKey?: ApiKey): Promise<Workspace[]> {
    return this.workspacesService.list(this.tenantOf(user, apiKey), await this.accessService.accessFor(user, apiKey));
  }

  @Mutation(() => Workspace)
  @RequireScopes(ApiKeyScope.ADMIN)
  async createWorkspace(
    @CurrentUser() user: User | undefined,
    @CurrentApiKey() apiKey: ApiKey | undefined,
    @Args('input') input: CreateWorkspaceInput,
  ): Promise<Workspace> {
    this.assertAdmin(user);
    return this.workspacesService.create(this.tenantOf(user, apiKey), input);
  }

  @Mutation(() => Workspace)
  @RequireScopes(ApiKeyScope.ADMIN)
  async updateWorkspace(
    @CurrentUser() user: User | undefined,
    @CurrentApiKey() apiKey: ApiKey | undefined,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateWorkspaceInput,
  ): Promise<Workspace> {
    this.assertAdmin(user);
    return this.workspacesService.update(this.tenantOf(user, apiKey), id, input);
  }

  @Mutation(() => Boolean)
  @RequireScopes(ApiKeyScope.ADMIN)
  async deleteWorkspace(
    @CurrentUser() user: User | undefined,
    @CurrentApiKey() apiKey: ApiKey | undefined,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    this.assertAdmin(user);
    return this.workspacesService.remove(this.tenantOf(user, apiKey), id);
  }

  /** JWT users only: an API key has no stored workspace. */
  @Mutation(() => User)
  @UseGuards(GqlAuthGuard)
  async setActiveWorkspace(
    @CurrentUser() user: User,
    @Args('workspaceId', { type: () => ID }) workspaceId: string,
  ): Promise<User> {
    return this.workspacesService.setActive(user, workspaceId, await this.accessService.accessFor(user, null));
  }

  private tenantOf(user?: User, apiKey?: ApiKey): string {
    const tenantId = user?.tenantId || apiKey?.tenantId;
    if (!tenantId) throw new ForbiddenException('Tenant context required.');
    return tenantId;
  }

  /** An API key passes here: the guard already checked the admin scope. */
  private assertAdmin(user?: User): void {
    if (user && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only an admin can manage workspaces.');
    }
  }
}
