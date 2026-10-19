import { ForbiddenException } from '@nestjs/common';
import { User } from '../entities/user.entity';
import { Credential } from '../entities/credential.entity';
import { UserRole } from '../auth/user-role.enum';

/**
 * Who can delete or move an account. With no user (an API key), the scope guard
 * already checked credentials:write.
 */
export function canManageCredential(user: User | undefined, credential: Credential): boolean {
  if (!user) return true;
  if (user.role === UserRole.ADMIN || user.role === UserRole.MANAGER) return true;
  return credential.userId === user.id;
}

export function assertCanManageCredential(user: User | undefined, credential: Credential): void {
  if (!canManageCredential(user, credential)) {
    throw new ForbiddenException(
      'Only an admin, a manager, or the person who connected this account can change it.',
    );
  }
}
