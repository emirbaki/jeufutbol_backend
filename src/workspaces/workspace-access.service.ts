import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkspaceMember, WorkspaceRole } from '../entities/workspace-member.entity';
import { User } from '../entities/user.entity';
import { ApiKey } from '../entities/api-key.entity';
import { UserRole } from '../auth/user-role.enum';

export const MANAGE_WORKSPACES = 'Only an admin, or an API key for all branches, can manage workspaces.';

/** The branches a caller can reach: all of them, or a list of workspace IDs. */
export type WorkspaceAccess = 'all' | string[];

/** The branches in both lists. */
export function intersectAccess(a: WorkspaceAccess, b: WorkspaceAccess): WorkspaceAccess {
  if (a === 'all') return b;
  if (b === 'all') return a;
  return a.filter((id) => b.includes(id));
}

/** True when the access list includes the branch. */
export function reaches(access: WorkspaceAccess, workspaceId: string | null | undefined): boolean {
  if (access === 'all') return true;
  return !!workspaceId && access.includes(workspaceId);
}

@Injectable()
export class WorkspaceAccessService {
  constructor(
    @InjectRepository(WorkspaceMember)
    private readonly memberRepository: Repository<WorkspaceMember>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * An API key limits by its own list (empty means all), and never reaches more
   * than the person who made it. An admin reaches all. Another user reaches the
   * branches of their memberships.
   */
  async accessFor(user?: User | null, apiKey?: ApiKey | null): Promise<WorkspaceAccess> {
    if (apiKey) {
      const own: WorkspaceAccess = apiKey.workspaceIds?.length ? [...apiKey.workspaceIds] : 'all';
      const creator = apiKey.createdByUserId
        ? await this.userRepository.findOne({ where: { id: apiKey.createdByUserId } })
        : null;
      // A key whose creator no longer exists keeps its own list.
      return creator ? intersectAccess(own, await this.accessFor(creator, null)) : own;
    }
    if (!user) return [];
    if (user.role === UserRole.ADMIN) return 'all';
    const memberships = await this.memberRepository.find({
      where: { userId: user.id },
      order: { createdAt: 'ASC' },
    });
    return memberships.map((m) => m.workspaceId);
  }

  canReach(access: WorkspaceAccess, workspaceId: string | null | undefined): boolean {
    return reaches(access, workspaceId);
  }

  async roleIn(user: User | null | undefined, workspaceId: string): Promise<'ADMIN' | WorkspaceRole | null> {
    if (!user) return null;
    if (user.role === UserRole.ADMIN) return 'ADMIN';
    const membership = await this.memberRepository.findOne({ where: { userId: user.id, workspaceId } });
    return membership?.role ?? null;
  }

  /** A row in a branch without access is "not found", so the branch stays hidden. */
  assertRow(access: WorkspaceAccess, workspaceId: string | null | undefined, what: string): void {
    if (!this.canReach(access, workspaceId)) {
      throw new NotFoundException(`${what} not found.`);
    }
  }

  async oldestMembership(userId: string): Promise<string | null> {
    const membership = await this.memberRepository.findOne({
      where: { userId },
      order: { createdAt: 'ASC' },
    });
    return membership?.workspaceId ?? null;
  }
}
