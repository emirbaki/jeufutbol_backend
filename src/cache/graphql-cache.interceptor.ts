import { CacheInterceptor } from '@nestjs/cache-manager';
import { CallHandler, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { WorkspaceAccessService, reaches } from '../workspaces/workspace-access.service';
import { GqlExecutionContext } from '@nestjs/graphql';
import { isUuid } from '../workspaces/workspace.utils';
import { readWorkspaceHeader } from '../workspaces/active-workspace.decorator';

function sortObject(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => sortObject(item));
  }
  return Object.keys(obj)
    .sort()
    .reduce((result, key) => {
      result[key] = sortObject(obj[key]);
      return result;
    }, {});
}

/**
 * Queries whose data mutations change. A delete by key cannot reach every
 * argument variant (for example limit: 50), so these are never cached.
 */
const NOT_CACHED = new Set(['getInsights', 'getMonitoredProfiles', 'getMonitoredProfile']);

/**
 * The cache key of a GraphQL query for one workspace of a tenant.
 * Use it also to delete the cached entry after a change.
 */
export function graphqlCacheKey(tenantId: string, workspaceId: string, fieldName: string, args: object = {}): string {
  return `${tenantId}:${workspaceId}:${fieldName}:${JSON.stringify(sortObject(args))}`;
}

@Injectable()
export class GraphqlCacheInterceptor extends CacheInterceptor {
  @Inject(WorkspaceAccessService)
  private readonly accessService!: WorkspaceAccessService;

  /**
   * Pipes run after interceptors, so a cache hit would skip the branch check of
   * ActiveWorkspacePipe. A caller who cannot reach the header branch skips the
   * cache, and the pipe then rejects the request.
   */
  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    if (this.trackBy(context)) {
      const req = GqlExecutionContext.create(context).getContext().req;
      const access = await this.accessService.accessFor(req?.user, req?.apiKey);
      if (!reaches(access, readWorkspaceHeader(req))) return next.handle();
    }
    return super.intercept(context, next);
  }

  trackBy(context: ExecutionContext): string | undefined {
    const gqlContext = GqlExecutionContext.create(context);
    const info = gqlContext.getInfo();

    // If no info (not a GraphQL request), fall back to super
    if (!info) {
      return super.trackBy(context);
    }

    // Cache only queries. A cached mutation would skip its effect.
    if (info.operation?.operation !== 'query' || NOT_CACHED.has(info.fieldName)) {
      return undefined;
    }

    // Cache only when the tenant and the workspace ID are known, so that one
    // branch never gets the cached data of another branch.
    const req = gqlContext.getContext().req;
    const tenantId: string | undefined = req?.user?.tenantId || req?.apiKey?.tenantId;
    const workspaceId = readWorkspaceHeader(req);
    if (!tenantId || !workspaceId || !isUuid(workspaceId)) {
      return undefined;
    }

    return graphqlCacheKey(tenantId, workspaceId, info.fieldName, gqlContext.getArgs());
  }
}
