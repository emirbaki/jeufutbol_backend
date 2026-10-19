import { ForbiddenException } from '@nestjs/common';
import { User } from '../entities/user.entity';
import { Credential } from '../entities/credential.entity';
import { WorkspaceRole } from '../entities/workspace-member.entity';

export type BranchRole = 'ADMIN' | WorkspaceRole | null;

/**
 * Who can delete or move an account: an admin, a manager of the account's
 * branch, or the person who connected it. With no user (an API key), the
 * scope guard already checked credentials:write.
 */
export function canManageCredential(role: BranchRole, user: User | undefined, credential: Credential): boolean {
  if (!user) return true;
  if (role === 'ADMIN' || role === WorkspaceRole.MANAGER) return true;
  return role !== null && credential.userId === user.id;
}

export function assertCanManageCredential(role: BranchRole, user: User | undefined, credential: Credential): void {
  if (!canManageCredential(role, user, credential)) {
    throw new ForbiddenException(
      'Only an admin, a manager of this branch, or the person who connected this account can change it.',
    );
  }
}
