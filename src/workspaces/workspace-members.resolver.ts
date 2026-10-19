import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { WorkspaceMember, WorkspaceRole } from '../entities/workspace-member.entity';
import { WorkspaceMembersService } from './workspace-members.service';
import { WorkspaceAccessService } from './workspace-access.service';

/** Branch members and the organization admin role. Signed-in people only (no API keys). */
@Resolver(() => User)
export class WorkspaceMembersResolver {
  constructor(
    private readonly membersService: WorkspaceMembersService,
    private readonly accessService: WorkspaceAccessService,
  ) {}

  /** The memberships of a person, only for the branches the viewer reaches. */
  @ResolveField(() => [WorkspaceMember])
  async workspaceMemberships(@Parent() person: User, @CurrentUser() viewer: User): Promise<WorkspaceMember[]> {
    const list = await this.membersService.membersOf(person.id);
    return this.membersService.membershipsVisibleTo(list, await this.accessService.accessFor(viewer, null));
  }

  @Mutation(() => WorkspaceMember)
  @UseGuards(GqlAuthGuard)
  addWorkspaceMember(
    @CurrentUser() actor: User,
    @Args('workspaceId', { type: () => ID }) workspaceId: string,
    @Args('userId', { type: () => ID }) userId: string,
    @Args('role', { type: () => WorkspaceRole }) role: WorkspaceRole,
  ): Promise<WorkspaceMember> {
    return this.membersService.add(actor, workspaceId, userId, role);
  }

  @Mutation(() => WorkspaceMember)
  @UseGuards(GqlAuthGuard)
  updateWorkspaceMember(
    @CurrentUser() actor: User,
    @Args('workspaceId', { type: () => ID }) workspaceId: string,
    @Args('userId', { type: () => ID }) userId: string,
    @Args('role', { type: () => WorkspaceRole }) role: WorkspaceRole,
  ): Promise<WorkspaceMember> {
    return this.membersService.update(actor, workspaceId, userId, role);
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  removeWorkspaceMember(
    @CurrentUser() actor: User,
    @Args('workspaceId', { type: () => ID }) workspaceId: string,
    @Args('userId', { type: () => ID }) userId: string,
  ): Promise<boolean> {
    return this.membersService.remove(actor, workspaceId, userId);
  }

  @Mutation(() => User)
  @UseGuards(GqlAuthGuard)
  setUserAdmin(
    @CurrentUser() actor: User,
    @Args('userId', { type: () => ID }) userId: string,
    @Args('isAdmin') isAdmin: boolean,
  ): Promise<User> {
    return this.membersService.setAdmin(actor, userId, isAdmin);
  }
}
