import { TASK_CAPABILITY_SCOPES } from '@nangohq/internal-auth';

import type { Scope } from '@nangohq/authz';

export function scriptScopeForRequest(req: { method: string; path: string; originalUrl?: string }): string | null {
    const raw = req.path || req.originalUrl?.split('?')[0] || '';
    const path = raw.replace(/\/+$/, '') || '/';
    const method = req.method.toUpperCase();

    if (path.startsWith('/proxy')) {
        return TASK_CAPABILITY_SCOPES.apiProxy;
    }
    if (method === 'GET' && path === '/environment-variables') {
        return TASK_CAPABILITY_SCOPES.apiEnvVarsRead;
    }
    if ((method === 'POST' || method === 'PATCH') && path === '/connections/metadata') {
        return TASK_CAPABILITY_SCOPES.apiMetadataWrite;
    }
    if (method === 'GET' && /^\/connections\/[^/]+$/.test(path)) {
        return TASK_CAPABILITY_SCOPES.apiConnectionRead;
    }
    if (method === 'GET' && /^\/integrations\/[^/]+$/.test(path)) {
        return TASK_CAPABILITY_SCOPES.apiIntegrationRead;
    }
    if (method === 'POST' && (path === '/sync/trigger' || path === '/sync/start')) {
        return TASK_CAPABILITY_SCOPES.apiSyncTrigger;
    }
    if (method === 'POST' && path === '/action/trigger') {
        return TASK_CAPABILITY_SCOPES.apiActionTrigger;
    }
    return null;
}

const TOKEN_SCOPE_TO_ENVIRONMENT_SCOPES: Record<string, readonly Scope[]> = {
    [TASK_CAPABILITY_SCOPES.apiConnectionRead]: ['environment:connections:read', 'environment:connections:read_credentials'],
    [TASK_CAPABILITY_SCOPES.apiIntegrationRead]: ['environment:integrations:read', 'environment:integrations:read_credentials'],
    [TASK_CAPABILITY_SCOPES.apiMetadataWrite]: ['environment:connections:update'],
    [TASK_CAPABILITY_SCOPES.apiEnvVarsRead]: ['environment:variables:read'],
    [TASK_CAPABILITY_SCOPES.apiSyncTrigger]: ['environment:syncs:execute'],
    [TASK_CAPABILITY_SCOPES.apiActionTrigger]: ['environment:actions:execute'],
    [TASK_CAPABILITY_SCOPES.apiProxy]: ['environment:proxy']
};

/** Environment scopes the public-API `can()` checks need for the scopes on this token. */
export function environmentScopesForTokenScopes(scopes: readonly string[]): string[] {
    const environmentScopes = new Set<string>();
    for (const scope of scopes) {
        for (const environmentScope of TOKEN_SCOPE_TO_ENVIRONMENT_SCOPES[scope] ?? []) {
            environmentScopes.add(environmentScope);
        }
    }
    return [...environmentScopes];
}
