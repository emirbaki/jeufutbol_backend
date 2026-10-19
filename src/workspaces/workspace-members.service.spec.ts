jest.mock('uuid', () => ({ v4: () => require('crypto').randomUUID() }));

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { WorkspaceMembersService } from './workspace-members.service';
import { WorkspaceRole } from '../entities/workspace-member.entity';
import { UserRole } from '../auth/user-role.enum';

const admin = { id: 'a1', tenantId: 't1', role: UserRole.ADMIN } as any;
const manager = { id: 'm1', tenantId: 't1', role: UserRole.MANAGER } as any;

describe('WorkspaceMembersService', () => {
  let members: Record<string, jest.Mock>;
  let users: Record<string, jest.Mock>;
  let workspaces: { findOne: jest.Mock };
  let access: { roleIn: jest.Mock };
  let svc: WorkspaceMembersService;

  beforeEach(() => {
    members = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(2),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 'mem', ...x })),
      delete: jest.fn(),
    };
    users = {
      findOne: jest.fn().mockResolvedValue({ id: 'u2', tenantId: 't1', role: UserRole.USER }),
      count: jest.fn().mockResolvedValue(2),
      save: jest.fn(async (x) => x),
    };
    workspaces = { findOne: jest.fn().mockResolvedValue({ id: 'w1', tenantId: 't1' }) };
    access = { roleIn: jest.fn().mockResolvedValue(WorkspaceRole.MANAGER) };
    svc = new WorkspaceMembersService(members as any, users as any, workspaces as any, access as any);
  });

  describe('assertCanManageBranch', () => {
    it('admin can manage any branch and give any role', async () => {
      await expect(svc.assertCanManageBranch(admin, 'w1', 'ADMIN')).resolves.toBeUndefined();
    });

    it('manager can invite into their branch as USER and MANAGER', async () => {
      await expect(svc.assertCanManageBranch(manager, 'w1', WorkspaceRole.USER)).resolves.toBeUndefined();
      await expect(svc.assertCanManageBranch(manager, 'w1', WorkspaceRole.MANAGER)).resolves.toBeUndefined();
    });

    it('manager cannot invite into a branch where they are USER', async () => {
      access.roleIn.mockResolvedValue(WorkspaceRole.USER);
      await expect(svc.assertCanManageBranch(manager, 'w1', WorkspaceRole.USER)).rejects.toThrow(
        new ForbiddenException('Only an admin or a manager of this branch can do this.'),
      );
    });

    it('manager cannot give ADMIN', async () => {
      await expect(svc.assertCanManageBranch(manager, 'w1', 'ADMIN')).rejects.toThrow(
        new ForbiddenException('Only an admin can give the admin role.'),
      );
    });

    it('a branch of another tenant is not found', async () => {
      workspaces.findOne.mockResolvedValue(null);
      await expect(svc.assertCanManageBranch(admin, 'w9')).rejects.toBeInstanceOf(NotFoundException);
      expect(workspaces.findOne).toHaveBeenCalledWith({ where: { id: 'w9', tenantId: 't1' } });
    });
  });

  it('add makes a membership for a person of the tenant', async () => {
    await svc.add(manager, 'w1', 'u2', WorkspaceRole.USER);
    expect(users.findOne).toHaveBeenCalledWith({ where: { id: 'u2', tenantId: 't1' } });
    expect(members.save).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'w1', userId: 'u2', role: 'USER' }));
  });

  it('add of a person of another tenant is not found', async () => {
    users.findOne.mockResolvedValue(null);
    await expect(svc.add(manager, 'w1', 'u9', WorkspaceRole.USER)).rejects.toThrow(new NotFoundException('Person not found.'));
  });

  it('cannot remove the last membership', async () => {
    members.findOne.mockResolvedValue({ id: 'mem', workspaceId: 'w1', userId: 'u2' });
    members.count.mockResolvedValue(1);
    await expect(svc.remove(manager, 'w1', 'u2')).rejects.toThrow(
      new BadRequestException(
        'This is the last branch of this person. Add another branch first, or remove the person from the organization.',
      ),
    );
    expect(members.delete).not.toHaveBeenCalled();
  });

  it('remove deletes a membership when the person has another branch', async () => {
    members.findOne.mockResolvedValue({ id: 'mem', workspaceId: 'w1', userId: 'u2' });
    await expect(svc.remove(manager, 'w1', 'u2')).resolves.toBe(true);
    expect(members.delete).toHaveBeenCalledWith({ id: 'mem' });
  });

  it('only an admin can set the admin role', async () => {
    await expect(svc.setAdmin(manager, 'u2', true)).rejects.toThrow(new ForbiddenException('Only an admin can give the admin role.'));
  });

  it('cannot remove the last admin', async () => {
    users.findOne.mockResolvedValue({ id: 'a1', tenantId: 't1', role: UserRole.ADMIN });
    users.count.mockResolvedValue(1);
    await expect(svc.setAdmin(admin, 'a1', false)).rejects.toThrow(
      new BadRequestException('The organization needs at least one admin.'),
    );
  });

  it('removing the admin role restores the oldest branch role', async () => {
    users.findOne.mockResolvedValue({ id: 'a2', tenantId: 't1', role: UserRole.ADMIN });
    members.findOne.mockResolvedValue({ role: WorkspaceRole.MANAGER });
    const out = await svc.setAdmin(admin, 'a2', false);
    expect(out.role).toBe(UserRole.MANAGER);
  });

  it('membershipsVisibleTo shows a manager only the branches they share', async () => {
    const list = [
      { workspaceId: 'w1', role: 'USER' },
      { workspaceId: 'w2', role: 'USER' },
    ] as any;
    expect(svc.membershipsVisibleTo(list, 'all')).toHaveLength(2);
    expect(svc.membershipsVisibleTo(list, ['w1'])).toEqual([{ workspaceId: 'w1', role: 'USER' }]);
  });
});
