import { CacheInterceptor } from '@nestjs/cache-manager';
import { ExecutionContext, Injectable } from '@nestjs/common';
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
 * The cache key of a GraphQL query for one workspace of a tenant.
 * Use it also to delete the cached entry after a change.
 */
export function graphqlCacheKey(tenantId: string, workspaceId: string, fieldName: string, args: object = {}): string {
  return `${tenantId}:${workspaceId}:${fieldName}:${JSON.stringify(sortObject(args))}`;
}

@Injectable()
export class GraphqlCacheInterceptor extends CacheInterceptor {
  trackBy(context: ExecutionContext): string | undefined {
    const gqlContext = GqlExecutionContext.create(context);
    const info = gqlContext.getInfo();

    // If no info (not a GraphQL request), fall back to super
    if (!info) {
      return super.trackBy(context);
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
