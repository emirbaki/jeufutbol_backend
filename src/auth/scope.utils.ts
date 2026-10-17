import { ApiKeyScope } from './api-key-scopes.enum';

export interface ScopeGrant {
    isUser: boolean;
    scopes: string[];
}

export function hasScopes(grant: ScopeGrant, required: string[]): boolean {
    // A user authenticated with JWT has all scopes
    if (grant.isUser) {
        return true;
    }

    // The admin scope grants all permissions
    if (grant.scopes.includes(ApiKeyScope.ADMIN)) {
        return true;
    }

    // The READ_ONLY scope grants all read permissions
    if (
        grant.scopes.includes(ApiKeyScope.READ_ONLY) &&
        required.every((scope) => scope.endsWith(':read'))
    ) {
        return true;
    }

    return required.every((scope) => grant.scopes.includes(scope));
}
