import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkspaceMember, WorkspaceRole } from '../entities/workspace-member.entity';
import { User } from '../entities/user.entity';
import { Workspace } from '../entities/workspace.entity';
import { UserRole } from '../auth/user-role.enum';
import { WorkspaceAccess, WorkspaceAccessService, reaches } from './workspace-access.service';

const MANAGER_ONLY = 'Only an admin or a manager of this branch can do this.';
const ADMIN_ONLY = 'Only an admin can give the admin role.';

/** Branch memberships and the organization admin role. */
@Injectable()
export class WorkspaceMembersService {
  constructor(
    @InjectRepository(WorkspaceMember)
    private readonly memberRepository: Repository<WorkspaceMember>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Workspace)
    private readonly workspaceRepository: Repository<Workspace>,
    private readonly accessService: WorkspaceAccessService,
  ) {}

  /**
   * An admin manages every branch. A manager manages their own branches and
   * can give MANAGER or USER, never ADMIN.
   */
  async assertCanManageBranch(actor: User, workspaceId: string, givenRole?: WorkspaceRole | 'ADMIN'): Promise<void> {
    const workspace = await this.workspaceRepository.findOne({ where: { id: workspaceId, tenantId: actor.tenantId } });
    if (!workspace) throw new NotFoundException('Workspace not found.');
    if (actor.role === UserRole.ADMIN) return;
    const role = await this.accessService.roleIn(actor, workspaceId);
    if (role !== WorkspaceRole.MANAGER) throw new ForbiddenException(MANAGER_ONLY);
    if (givenRole === 'ADMIN') throw new ForbiddenException(ADMIN_ONLY);
  }

  async add(actor: User, workspaceId: string, userId: string, role: WorkspaceRole): Promise<WorkspaceMember> {
    await this.assertCanManageBranch(actor, workspaceId, role);
    await this.findPerson(actor, userId);
    const existing = await this.memberRepository.findOne({ where: { workspaceId, userId } });
    if (existing) {
      existing.role = role;
      return this.memberRepository.save(existing);
    }
    return this.memberRepository.save(this.memberRepository.create({ workspaceId, userId, role }));
  }

  async update(actor: User, workspaceId: string, userId: string, role: WorkspaceRole): Promise<WorkspaceMember> {
    await this.assertCanManageBranch(actor, workspaceId, role);
    const membership = await this.findMembership(workspaceId, userId);
    membership.role = role;
    return this.memberRepository.save(membership);
  }

  async remove(actor: User, workspaceId: string, userId: string): Promise<boolean> {
    await this.assertCanManageBranch(actor, workspaceId);
    const person = await this.findPerson(actor, userId);
    const membership = await this.findMembership(workspaceId, userId);
    // A non-admin with no branch would see nothing, so the last one stays.
    if (person.role !== UserRole.ADMIN && (await this.memberRepository.count({ where: { userId } })) <= 1) {
      throw new BadRequestException(
        'This is the last branch of this person. Add another branch first, or remove the person from the organization.',
      );
    }
    await this.memberRepository.delete({ id: membership.id });
    return true;
  }

  /** Gives or takes the organization admin role. The memberships stay. */
  async setAdmin(actor: User, userId: string, isAdmin: boolean): Promise<User> {
    if (actor.role !== UserRole.ADMIN) throw new ForbiddenException(ADMIN_ONLY);
    const person = await this.findPerson(actor, userId);
    if (isAdmin) {
      person.role = UserRole.ADMIN;
      return this.userRepository.save(person);
    }
    if (person.role === UserRole.ADMIN) {
      const admins = await this.userRepository.count({ where: { tenantId: actor.tenantId, role: UserRole.ADMIN } });
      if (admins <= 1) throw new BadRequestException('The organization needs at least one admin.');
    }
    const oldest = await this.memberRepository.findOne({ where: { userId }, order: { createdAt: 'ASC' } });
    if (!oldest) {
      throw new BadRequestException('Add this person to a branch first. Without a branch, they cannot see any data.');
    }
    person.role = oldest?.role === WorkspaceRole.MANAGER ? UserRole.MANAGER : UserRole.USER;
    return this.userRepository.save(person);
  }

  async membersOf(userId: string): Promise<WorkspaceMember[]> {
    return this.memberRepository.find({
      where: { userId },
      relations: ['workspace'],
      order: { createdAt: 'ASC' },
    });
  }

  /** The branches where the actor can manage people: all for an admin, else their MANAGER branches. */
  async managedWorkspaceIds(actor: User): Promise<WorkspaceAccess> {
    if (actor.role === UserRole.ADMIN) return 'all';
    const memberships = await this.memberRepository.find({ where: { userId: actor.id, role: WorkspaceRole.MANAGER } });
    return memberships.map((m) => m.workspaceId);
  }

  /** A viewer sees only the memberships of the branches they reach. */
  membershipsVisibleTo<T extends { workspaceId: string }>(list: T[], viewerAccess: WorkspaceAccess): T[] {
    return list.filter((m) => reaches(viewerAccess, m.workspaceId));
  }

  /** People who have a membership in one of these branches. */
  async userIdsIn(workspaceIds: string[]): Promise<string[]> {
    if (!workspaceIds.length) return [];
    const rows = await this.memberRepository
      .createQueryBuilder('m')
      .select('DISTINCT m.userId', 'userId')
      .where('m.workspaceId IN (:...workspaceIds)', { workspaceIds })
      .getRawMany<{ userId: string }>();
    return rows.map((r) => r.userId);
  }

  private async findPerson(actor: User, userId: string): Promise<User> {
    const person = await this.userRepository.findOne({ where: { id: userId, tenantId: actor.tenantId } });
    if (!person) throw new NotFoundException('Person not found.');
    return person;
  }

  private async findMembership(workspaceId: string, userId: string): Promise<WorkspaceMember> {
    const membership = await this.memberRepository.findOne({ where: { workspaceId, userId } });
    if (!membership) throw new NotFoundException('Membership not found.');
    return membership;
  }
}
