import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkspaceMember, WorkspaceRole } from '../entities/workspace-member.entity';
import { User } from '../entities/user.entity';
import { ApiKey } from '../entities/api-key.entity';
import { UserRole } from '../auth/user-role.enum';

/** The branches a caller can reach: all of them, or a list of workspace IDs. */
export type WorkspaceAccess = 'all' | string[];

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
  ) {}

  /**
   * An API key limits by its own list (empty means all). An admin reaches all.
   * Another user reaches the branches of their memberships.
   */
  async accessFor(user?: User | null, apiKey?: ApiKey | null): Promise<WorkspaceAccess> {
    if (apiKey) return apiKey.workspaceIds?.length ? [...apiKey.workspaceIds] : 'all';
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
