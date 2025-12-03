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
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { UserInvitation } from '../entities/user-invitation.entity';
import { Tenant } from '../entities/tenant.entity';
import { UserRole } from '../auth/user-role.enum';
import { InvitationStatus } from '../entities/user-invitation.entity';
import { InviteUserInput } from '../graphql/types/invite-user.input';
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
  ) { }

  @Query(() => [User])
  async getOrganizationUsers(@CurrentUser() user: User): Promise<User[]> {
    // Get all users in the same tenant/organization
    return this.userRepository.find({
      where: { tenantId: user.tenantId, isActive: true },
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
    // Only ADMIN and MANAGER can invite users
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.MANAGER) {
      throw new ForbiddenException('Only admins and managers can invite users');
    }

    // Check if user is already part of the organization
    const existingUser = await this.userRepository.findOne({
      where: { email: input.email, tenantId: user.tenantId },
    });

    if (existingUser) {
      throw new BadRequestException(
        'User with this email is already part of your organization',
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
      role: input.role,
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
    // Only ADMIN and MANAGER can view invitations
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.MANAGER) {
      throw new ForbiddenException(
        'Only admins and managers can view invitations',
      );
    }

    return this.invitationRepository.find({
      where: {
        tenantId: user.tenantId,
        status: InvitationStatus.PENDING,
      },
      relations: ['invitedBy'],
      order: { createdAt: 'DESC' },
    });
  }

  @Mutation(() => Boolean)
  async revokeInvitation(
    @CurrentUser() user: User,
    @Args('invitationId', { type: () => ID }) invitationId: string,
  ): Promise<boolean> {
    // Only ADMIN and MANAGER can revoke invitations
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.MANAGER) {
      throw new ForbiddenException(
        'Only admins and managers can revoke invitations',
      );
    }

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

    invitation.status = InvitationStatus.REVOKED;
    await this.invitationRepository.save(invitation);

    return true;
  }
}
