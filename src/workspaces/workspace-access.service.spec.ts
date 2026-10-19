jest.mock('uuid', () => ({ v4: () => require('crypto').randomUUID() }));

import { NotFoundException } from '@nestjs/common';
import { WorkspaceAccessService } from './workspace-access.service';
import { UserRole } from '../auth/user-role.enum';
import { WorkspaceRole } from '../entities/workspace-member.entity';

const admin = { id: 'a1', role: UserRole.ADMIN } as any;
const member = { id: 'u1', role: UserRole.USER } as any;

describe('WorkspaceAccessService', () => {
  let members: { find: jest.Mock; findOne: jest.Mock };
  let users: { findOne: jest.Mock };
  let svc: WorkspaceAccessService;

  beforeEach(() => {
    members = { find: jest.fn().mockResolvedValue([]), findOne: jest.fn().mockResolvedValue(null) };
    users = { findOne: jest.fn().mockResolvedValue(null) };
    svc = new WorkspaceAccessService(members as any, users as any);
  });

  describe('accessFor', () => {
    it('admin reaches all', async () => {
      await expect(svc.accessFor(admin, null)).resolves.toBe('all');
    });

    it('a key with an empty list reaches all', async () => {
      await expect(svc.accessFor(null, { workspaceIds: [] } as any)).resolves.toBe('all');
    });

    it('a key with a list reaches only the list (the user is ignored)', async () => {
      await expect(svc.accessFor(admin, { workspaceIds: ['w2'] } as any)).resolves.toEqual(['w2']);
    });

    it('a key never reaches more than its creator: an all-branch key of a member', async () => {
      users.findOne.mockResolvedValue(member);
      members.find.mockResolvedValue([{ workspaceId: 'w1' }]);
      await expect(svc.accessFor(null, { workspaceIds: [], createdByUserId: 'u1' } as any)).resolves.toEqual(['w1']);
      expect(users.findOne).toHaveBeenCalledWith({ where: { id: 'u1' } });
    });

    it('a key list is cut to the branches of its creator', async () => {
      users.findOne.mockResolvedValue(member);
      members.find.mockResolvedValue([{ workspaceId: 'w1' }]);
      await expect(
        svc.accessFor(null, { workspaceIds: ['w1', 'w2'], createdByUserId: 'u1' } as any),
      ).resolves.toEqual(['w1']);
    });

    it('a key of an admin keeps its own list', async () => {
      users.findOne.mockResolvedValue(admin);
      await expect(svc.accessFor(null, { workspaceIds: ['w2'], createdByUserId: 'a1' } as any)).resolves.toEqual(['w2']);
    });

    it('a member reaches only their branches', async () => {
      members.find.mockResolvedValue([{ workspaceId: 'w1' }, { workspaceId: 'w3' }]);
      await expect(svc.accessFor(member, null)).resolves.toEqual(['w1', 'w3']);
      expect(members.find).toHaveBeenCalledWith({ where: { userId: 'u1' }, order: { createdAt: 'ASC' } });
    });

    it('no user and no key reaches nothing', async () => {
      await expect(svc.accessFor(null, null)).resolves.toEqual([]);
    });
  });

  describe('canReach', () => {
    it('all reaches any branch', () => {
      expect(svc.canReach('all', 'w9')).toBe(true);
    });

    it('a list reaches only its branches and rejects a null branch', () => {
      expect(svc.canReach(['w1'], 'w1')).toBe(true);
      expect(svc.canReach(['w1'], 'w2')).toBe(false);
      expect(svc.canReach(['w1'], null)).toBe(false);
    });
  });

  it('roleIn gives ADMIN, MANAGER, USER or null', async () => {
    await expect(svc.roleIn(admin, 'w1')).resolves.toBe('ADMIN');
    members.findOne.mockResolvedValueOnce({ role: WorkspaceRole.MANAGER });
    await expect(svc.roleIn(member, 'w1')).resolves.toBe(WorkspaceRole.MANAGER);
    members.findOne.mockResolvedValueOnce({ role: WorkspaceRole.USER });
    await expect(svc.roleIn(member, 'w1')).resolves.toBe(WorkspaceRole.USER);
    await expect(svc.roleIn(member, 'w2')).resolves.toBeNull();
    await expect(svc.roleIn(undefined, 'w1')).resolves.toBeNull();
  });

  it('assertRow throws "Post not found." for a branch outside the list', () => {
    expect(() => svc.assertRow(['w1'], 'w2', 'Post')).toThrow(new NotFoundException('Post not found.'));
    expect(() => svc.assertRow(['w1'], 'w1', 'Post')).not.toThrow();
    expect(() => svc.assertRow('all', null, 'Post')).not.toThrow();
  });

  it('oldestMembership gives the first branch or null', async () => {
    members.findOne.mockResolvedValueOnce({ workspaceId: 'w1' });
    await expect(svc.oldestMembership('u1')).resolves.toBe('w1');
    expect(members.findOne).toHaveBeenCalledWith({ where: { userId: 'u1' }, order: { createdAt: 'ASC' } });
    await expect(svc.oldestMembership('u1')).resolves.toBeNull();
  });
});
