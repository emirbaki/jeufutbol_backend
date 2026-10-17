import {
    Injectable,
    CanActivate,
    ExecutionContext,
    ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { SCOPES_KEY } from '../decorators/require-scopes.decorator';
import { hasScopes } from '../scope.utils';

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

        if (!request.user && !request.apiKey) {
            throw new ForbiddenException(
                'API key authentication required for this operation',
            );
        }

        const granted = hasScopes(
            { isUser: !!request.user, scopes: request.apiKey?.scopes ?? [] },
            requiredScopes,
        );

        if (!granted) {
            throw new ForbiddenException(
                `API key does not have required scopes: ${requiredScopes.join(', ')}`,
            );
        }

        return true;
    }
}
