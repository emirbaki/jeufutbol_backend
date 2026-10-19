import {
  Resolver,
  Query,
  Mutation,
  Args,
  ID,
  ResolveField,
  Parent,
} from '@nestjs/graphql';
import {
  UseGuards,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { UserInvitation } from '../entities/user-invitation.entity';
import { Tenant } from '../entities/tenant.entity';
import { UserRole } from '../auth/user-role.enum';
import { InvitationStatus } from '../entities/user-invitation.entity';
import { InviteUserInput } from '../graphql/types/invite-user.input';
import { WorkspaceMembersService } from '../workspaces/workspace-members.service';
import { WorkspaceRole } from '../entities/workspace-member.entity';
import { In } from 'typeorm';
import {
  UpdateProfileInput,
  ChangePasswordInput,
  UpdateNotificationSettingsInput,
} from '../graphql/types/user-settings.input';
import { EmailService } from '../email/email.service';
import { v4 as uuidv4 } from 'uuid';

@Resolver(() => User)
@UseGuards(GqlAuthGuard)
export class UserResolver {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(UserInvitation)
    private invitationRepository: Repository<UserInvitation>,
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,
    private emailService: EmailService,
    private membersService: WorkspaceMembersService,
  ) { }

  @Query(() => [User])
  async getOrganizationUsers(@CurrentUser() user: User): Promise<User[]> {
    // An admin sees everybody. A manager sees the people of the branches they manage.
    const managed = await this.membersService.managedWorkspaceIds(user);
    if (managed !== 'all' && !managed.length) {
      throw new ForbiddenException('Only an admin or a manager of this branch can do this.');
    }
    const where: any = { tenantId: user.tenantId, isActive: true };
    if (managed !== 'all') where.id = In(await this.membersService.userIdsIn(managed));
    return this.userRepository.find({
      where,
      order: { createdAt: 'ASC' },
      select: [
        'id',
        'email',
        'firstName',
        'lastName',
        'role',
        'createdAt',
        'isVerified',
      ],
    });
  }

  @Mutation(() => UserInvitation)
  async inviteUser(
    @CurrentUser() user: User,
    @Args('input') input: InviteUserInput,
  ): Promise<UserInvitation> {
    // An admin invitation needs an admin. Any other invitation needs a branch
    // and a role, and the inviter must manage that branch.
    const isAdminInvite = input.role === UserRole.ADMIN;
    if (isAdminInvite) {
      if (user.role !== UserRole.ADMIN) {
        throw new ForbiddenException('Only an admin can give the admin role.');
      }
    } else {
      if (!input.workspaceId || !input.workspaceRole) {
        throw new BadRequestException('Choose a branch and a role.');
      }
      await this.membersService.assertCanManageBranch(user, input.workspaceId, input.workspaceRole);
    }

    // Check if user is already part of the organization
    const existingUser = await this.userRepository.findOne({
      where: { email: input.email, tenantId: user.tenantId },
    });

    if (existingUser) {
      throw new BadRequestException(
        'This person is already in the organization. Add them to the branch instead.',
      );
    }

    // Check if there's already a pending invitation
    const existingInvitation = await this.invitationRepository.findOne({
      where: {
        email: input.email,
        tenantId: user.tenantId,
        status: InvitationStatus.PENDING,
      },
    });

    if (existingInvitation) {
      throw new BadRequestException(
        'An invitation has already been sent to this email',
      );
    }

    // Create invitation
    const token = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // Expires in 7 days

    const invitation = this.invitationRepository.create({
      email: input.email,
      tenantId: user.tenantId,
      invitedByUserId: user.id,
      // For a branch invitation, the organization role mirrors the branch role (it grants nothing more).
      role: isAdminInvite
        ? UserRole.ADMIN
        : input.workspaceRole === WorkspaceRole.MANAGER
          ? UserRole.MANAGER
          : UserRole.USER,
      workspaceId: isAdminInvite ? null : input.workspaceId,
      workspaceRole: isAdminInvite ? null : input.workspaceRole,
      token,
      expiresAt,
      status: InvitationStatus.PENDING,
    });

    await this.invitationRepository.save(invitation);

    // Load tenant for email
    const tenant = await this.tenantRepository.findOneByOrFail({
      id: user.tenantId,
    });

    // Send invitation email
    const inviterName = `${user.firstName} ${user.lastName}`;
    await this.emailService.sendInvitationEmail(
      input.email,
      inviterName,
      tenant.name,
      token,
    );

    return invitation;
  }

  @Query(() => [UserInvitation])
  async listPendingInvitations(
    @CurrentUser() user: User,
  ): Promise<UserInvitation[]> {
    // An admin sees all invitations. A manager sees those of the branches they manage.
    const managed = await this.membersService.managedWorkspaceIds(user);
    if (managed !== 'all' && !managed.length) {
      throw new ForbiddenException('Only an admin or a manager of this branch can do this.');
    }
    const where: any = { tenantId: user.tenantId, status: InvitationStatus.PENDING };
    if (managed !== 'all') where.workspaceId = In(managed);

    return this.invitationRepository.find({
      where,
      relations: ['invitedBy'],
      order: { createdAt: 'DESC' },
    });
  }

  @Mutation(() => Boolean)
  async revokeInvitation(
    @CurrentUser() user: User,
    @Args('invitationId', { type: () => ID }) invitationId: string,
  ): Promise<boolean> {
    const invitation = await this.invitationRepository.findOne({
      where: { id: invitationId },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    // Ensure invitation belongs to same tenant
    if (invitation.tenantId !== user.tenantId) {
      throw new ForbiddenException('You can only revoke invitations from your organization');
    }

    // An admin invitation: admins only. A branch invitation: an admin or a manager of the branch.
    if (!invitation.workspaceId) {
      if (user.role !== UserRole.ADMIN) throw new ForbiddenException('Only an admin can give the admin role.');
    } else {
      await this.membersService.assertCanManageBranch(user, invitation.workspaceId);
    }

    invitation.status = InvitationStatus.REVOKED;
    await this.invitationRepository.save(invitation);

    return true;
  }

  // =====================
  // Profile & Settings Mutations
  // =====================

  @Mutation(() => User)
  async updateProfile(
    @CurrentUser() user: User,
    @Args('input') input: UpdateProfileInput,
  ): Promise<User> {
    const currentUser = await this.userRepository.findOneByOrFail({ id: user.id });

    if (input.firstName !== undefined) {
      currentUser.firstName = input.firstName;
    }
    if (input.lastName !== undefined) {
      currentUser.lastName = input.lastName;
    }

    return this.userRepository.save(currentUser);
  }

  @Mutation(() => Boolean)
  async changePassword(
    @CurrentUser() user: User,
    @Args('input') input: ChangePasswordInput,
  ): Promise<boolean> {
    const currentUser = await this.userRepository.findOneByOrFail({ id: user.id });

    // Verify current password
    const isPasswordValid = await bcrypt.compare(
      input.currentPassword,
      currentUser.passwordHash,
    );

    if (!isPasswordValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    // Hash and save new password
    const saltRounds = 10;
    currentUser.passwordHash = await bcrypt.hash(input.newPassword, saltRounds);
    await this.userRepository.save(currentUser);

    return true;
  }

  @Mutation(() => User)
  async updateNotificationSettings(
    @CurrentUser() user: User,
    @Args('input') input: UpdateNotificationSettingsInput,
  ): Promise<User> {
    const currentUser = await this.userRepository.findOneByOrFail({ id: user.id });

    if (input.notifyOnPublish !== undefined) {
      currentUser.notifyOnPublish = input.notifyOnPublish;
    }
    if (input.notifyOnFail !== undefined) {
      currentUser.notifyOnFail = input.notifyOnFail;
    }
    if (input.notifyWeeklyReport !== undefined) {
      currentUser.notifyWeeklyReport = input.notifyWeeklyReport;
    }
    if (input.notifyNewInsights !== undefined) {
      currentUser.notifyNewInsights = input.notifyNewInsights;
    }

    return this.userRepository.save(currentUser);
  }
}
