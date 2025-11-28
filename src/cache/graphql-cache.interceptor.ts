import { CacheInterceptor } from '@nestjs/cache-manager';
import { ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

@Injectable()
export class GraphqlCacheInterceptor extends CacheInterceptor {
    trackBy(context: ExecutionContext): string | undefined {
        const gqlContext = GqlExecutionContext.create(context);
        const info = gqlContext.getInfo();
        const args = gqlContext.getArgs();

        // If no info (not a GraphQL request), fall back to super
        if (!info) {
            return super.trackBy(context);
        }

        // Create a unique key based on field name and arguments
        // We sort keys to ensure consistent cache keys regardless of arg order
        const sortedArgs = this.sortObject(args);

        // Include user ID in the cache key to prevent data leakage between users
        const req = gqlContext.getContext().req;
        const userId = req?.user?.id;

        const key = `${userId ? userId + ':' : ''}${info.fieldName}:${JSON.stringify(sortedArgs)}`;

        return key;
    }

    private sortObject(obj: any): any {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }
        if (Array.isArray(obj)) {
            return obj.map((item) => this.sortObject(item));
        }
        return Object.keys(obj)
            .sort()
            .reduce((result, key) => {
                result[key] = this.sortObject(obj[key]);
                return result;
            }, {});
    }
}
