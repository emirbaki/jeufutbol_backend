import { ApiKeyScope } from './api-key-scopes.enum';

export interface ScopeGrant {
    isUser: boolean;
    scopes: string[];
}

// Every granular scope: all enum values except the two umbrella scopes.
const GRANULAR_SCOPES: string[] = Object.values(ApiKeyScope).filter(
    (scope) => scope !== ApiKeyScope.ADMIN && scope !== ApiKeyScope.READ_ONLY,
);

/**
 * The web app key form stores the plain text ADMIN and FULL_ACCESS.
 * Expand that text to the scopes that the checks below use.
 */
function expandScopes(scopes: string[]): string[] {
    const expanded = [...scopes];
    if (scopes.includes('ADMIN')) {
        expanded.push(ApiKeyScope.ADMIN);
    }
    if (scopes.includes('FULL_ACCESS')) {
        expanded.push(...GRANULAR_SCOPES);
    }
    return expanded;
}

export function hasScopes(grant: ScopeGrant, required: string[]): boolean {
    // A user authenticated with JWT has all scopes
    if (grant.isUser) {
        return true;
    }

    const scopes = expandScopes(grant.scopes);

    // The admin scope grants all permissions
    if (scopes.includes(ApiKeyScope.ADMIN)) {
        return true;
    }

    // The READ_ONLY scope grants all read permissions
    if (
        scopes.includes(ApiKeyScope.READ_ONLY) &&
        required.every((scope) => scope.endsWith(':read'))
    ) {
        return true;
    }

    return required.every((scope) => scopes.includes(scope));
}
