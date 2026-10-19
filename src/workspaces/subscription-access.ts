import { WorkspaceAccess, reaches } from './workspace-access.service';

/**
 * The subscription filter for a post event. The WebSocket connection keeps the
 * tenant and the branch access of its user (set in onConnect). A connection
 * without them gets no events.
 */
export function canReachFromContext(
  context: { req?: { tenantId?: string; workspaceAccess?: WorkspaceAccess } } | undefined,
  post: { tenantId?: string | null; workspaceId?: string | null } | undefined,
): boolean {
  const tenantId = context?.req?.tenantId;
  const access = context?.req?.workspaceAccess;
  if (!tenantId || !access || !post) return false;
  if (post.tenantId !== tenantId) return false;
  return reaches(access, post.workspaceId);
}
