import {
    Injectable,
    CanActivate,
    ExecutionContext,
    ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { SCOPES_KEY } from '../decorators/require-scopes.decorator';
import { ApiKeyScope } from '../api-key-scopes.enum';

@Injectable()
export class ApiKeyScopeGuard implements CanActivate {
    constructor(private reflector: Reflector) { }

    canActivate(context: ExecutionContext): boolean {
        const requiredScopes = this.reflector.getAllAndOverride<string[]>(
            SCOPES_KEY,
            [context.getHandler(), context.getClass()],
        );

        if (!requiredScopes || requiredScopes.length === 0) {
            return true;
        }

        let request;
        if (context.getType() === 'http') {
            request = context.switchToHttp().getRequest();
        } else {
            const ctx = GqlExecutionContext.create(context);
            request = ctx.getContext().req;
        }

        // If authenticated with JWT (user), allow all scopes
        if (request.user) {
            return true;
        }

        // If authenticated with API key, check scopes
        const apiKey = request.apiKey;
        if (!apiKey) {
            throw new ForbiddenException(
                'API key authentication required for this operation',
            );
        }

        // Check if API key has admin scope (grants all permissions)
        if (apiKey.scopes.includes(ApiKeyScope.ADMIN)) {
            return true;
        }

        // Check if API key has READ_ONLY scope (grants all read permissions)
        if (apiKey.scopes.includes(ApiKeyScope.READ_ONLY)) {
            const isReadOperation = requiredScopes.every((scope) =>
                scope.endsWith(':read'),
            );
            if (isReadOperation) {
                return true;
            }
        }

        // Check if API key has all required scopes
        const hasAllScopes = requiredScopes.every((scope) =>
            apiKey.scopes.includes(scope),
        );

        if (!hasAllScopes) {
            throw new ForbiddenException(
                `API key does not have required scopes: ${requiredScopes.join(', ')}`,
            );
        }

        return true;
    }
}
