import type { ApiKeyAuthorizationTarget, ApiKeyPrincipal, CustomerKeyScope } from '@nangohq/types';

export function hasApiKeyScope({ grantedScopes, requiredScope }: { grantedScopes: readonly string[] | undefined; requiredScope: CustomerKeyScope }): boolean {
    if (!grantedScopes) {
        return false;
    }

    for (const scope of grantedScopes) {
        if (scope === requiredScope) {
            return true;
        }
        if (scope.endsWith(':*') && requiredScope.startsWith(scope.slice(0, -1))) {
            return true;
        }
    }

    return false;
}

export function canAccessApiKeyTarget(principal: ApiKeyPrincipal, target: ApiKeyAuthorizationTarget): boolean {
    if (principal.accountId !== target.accountId) {
        return false;
    }

    if (target.type === 'account') {
        return true;
    }

    return principal.environmentIds.includes(target.environmentId);
}

export function authorizeApiKey({
    principal,
    requiredScope,
    target
}: {
    principal: ApiKeyPrincipal;
    requiredScope: CustomerKeyScope;
    target: ApiKeyAuthorizationTarget;
}): boolean {
    if (!requiredScope.startsWith(`${target.type}:`)) {
        return false;
    }

    return hasApiKeyScope({ grantedScopes: principal.scopes, requiredScope }) && canAccessApiKeyTarget(principal, target);
}
