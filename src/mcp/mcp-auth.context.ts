import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ScopeGrant } from '../auth/scope.utils';
import { User } from '../entities/user.entity';
import { ApiKey } from '../entities/api-key.entity';
import { WorkspaceAccess } from '../workspaces/workspace-access.service';

export interface McpAuthContext {
  userId: string;
  tenantId: string;
  grant: ScopeGrant;
  keyPrefix: string;
  apiBaseUrl: string;
  /** The branches the caller can reach (Phase 3). */
  access: WorkspaceAccess;
}

/**
 * Builds the MCP caller context from the request that CombinedAuthGuard accepted.
 * When the request has an API key, the key scopes apply, also if a user is set
 * (a tenant client sets both).
 */
export function buildMcpAuthContext(
  req: { user?: User; apiKey?: ApiKey },
  apiBaseUrl: string,
): McpAuthContext {
  const { user, apiKey } = req;

  if (apiKey) {
    if (!apiKey.createdByUserId) {
      throw new ForbiddenException('This API key has no user. Make a new key from a user account.');
    }
    return {
      userId: apiKey.createdByUserId,
      tenantId: apiKey.tenantId,
      grant: { isUser: false, scopes: apiKey.scopes ?? [] },
      keyPrefix: apiKey.keyPrefix,
      apiBaseUrl,
      access: 'all',
    };
  }

  if (user) {
    return {
      userId: user.id,
      tenantId: user.tenantId,
      grant: { isUser: true, scopes: [] },
      keyPrefix: 'user',
      apiBaseUrl,
      access: 'all',
    };
  }

  throw new UnauthorizedException('Authentication required.');
}
