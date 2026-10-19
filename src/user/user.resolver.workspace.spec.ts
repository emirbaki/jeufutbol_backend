jest.mock('uuid', () => ({ v4: () => require('crypto').randomUUID() }));

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { In } from 'typeorm';
import { UserResolver } from './user.resolver';
import { AuthService } from '../auth/auth.service';
import { UserRole } from '../auth/user-role.enum';
import { WorkspaceRole } from '../entities/workspace-member.entity';
import { InvitationStatus } from '../entities/user-invitation.entity';

const admin = { id: 'a1', tenantId: 't1', role: UserRole.ADMIN } as any;
const manager = { id: 'm1', tenantId: 't1', role: UserRole.MANAGER } as any;

describe('UserResolver with branches', () => {
  let users: Record<string, jest.Mock>;
  let invitations: Record<string, jest.Mock>;
  let members: Record<string, jest.Mock>;
  let resolver: UserResolver;

  beforeEach(() => {
    users = { findOne: jest.fn().mockResolvedValue(null), find: jest.fn().mockResolvedValue([]) };
    invitations = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => x),
    };
    const tenants = { findOneByOrFail: jest.fn().mockResolvedValue({ id: 't1', name: 'Jeuhub' }) };
    const email = { sendInvitationEmail: jest.fn() };
    members = {
      assertCanManageBranch: jest.fn().mockResolvedValue(undefined),
      managedWorkspaceIds: jest.fn().mockResolvedValue(['w1']),
      userIdsIn: jest.fn().mockResolvedValue(['m1', 'u2']),
    };
    resolver = new UserResolver(users as any, invitations as any, tenants as any, email as any, members as any);
  });

  it('a non-admin invitation needs a branch and a role', async () => {
    await expect(resolver.inviteUser(manager, { email: 'x@y.test', role: UserRole.USER } as any)).rejects.toThrow(
      new BadRequestException('Choose a branch and a role.'),
    );
  });

  it('a branch invitation checks the branch rights and saves the branch', async () => {
    await resolver.inviteUser(manager, {
      email: 'x@y.test',
      role: UserRole.USER,
      workspaceId: 'w1',
      workspaceRole: WorkspaceRole.MANAGER,
    } as any);
    expect(members.assertCanManageBranch).toHaveBeenCalledWith(manager, 'w1', WorkspaceRole.MANAGER);
    expect(invitations.save).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'w1', workspaceRole: 'MANAGER', role: UserRole.MANAGER }),
    );
  });

  it('only an admin can invite an admin', async () => {
    await expect(resolver.inviteUser(manager, { email: 'x@y.test', role: UserRole.ADMIN } as any)).rejects.toThrow(
      new ForbiddenException('Only an admin can give the admin role.'),
    );
    await resolver.inviteUser(admin, { email: 'x@y.test', role: UserRole.ADMIN } as any);
    expect(invitations.save).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: null, workspaceRole: null }));
  });

  it('inviting an existing person gives the add-instead text', async () => {
    users.findOne.mockResolvedValue({ id: 'u2' });
    await expect(
      resolver.inviteUser(admin, { email: 'x@y.test', role: UserRole.USER, workspaceId: 'w1', workspaceRole: 'USER' } as any),
    ).rejects.toThrow(new BadRequestException('This person is already in the organization. Add them to the branch instead.'));
  });

  it('manager sees only people of their branches', async () => {
    await resolver.getOrganizationUsers(manager);
    expect(members.userIdsIn).toHaveBeenCalledWith(['w1']);
    expect(users.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 't1', isActive: true, id: In(['m1', 'u2']) } }),
    );
  });

  it('a person who manages no branch cannot list people', async () => {
    members.managedWorkspaceIds.mockResolvedValue([]);
    await expect(resolver.getOrganizationUsers({ ...manager, role: UserRole.USER })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('manager sees only the invitations of their branches', async () => {
    await resolver.listPendingInvitations(manager);
    expect(invitations.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 't1', status: InvitationStatus.PENDING, workspaceId: In(['w1']) } }),
    );
  });
});

describe('AuthService.acceptInvitation with a branch', () => {
  it('accepting an invitation adds the membership', async () => {
    const svc: any = Object.create(AuthService.prototype);
    svc.invitationRepository = {
      findOne: jest.fn().mockResolvedValue({
        token: 'tok',
        email: 'x@y.test',
        status: InvitationStatus.PENDING,
        expiresAt: new Date(Date.now() + 60_000),
        tenantId: 't1',
        tenant: { id: 't1' },
        role: UserRole.USER,
        workspaceId: 'w1',
        workspaceRole: WorkspaceRole.USER,
      }),
      save: jest.fn(),
    };
    svc.userRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => Object.assign(x, { id: 'new-user' })),
    };
    svc.memberRepository = { save: jest.fn(), create: jest.fn((x) => x) };
    svc.jwtService = { sign: jest.fn().mockReturnValue('jwt') };
    await svc.acceptInvitation('tok', 'x@y.test', 'A', 'B', 'secret-123');
    expect(svc.memberRepository.save).toHaveBeenCalledWith({ workspaceId: 'w1', userId: 'new-user', role: 'USER' });
  });
});
