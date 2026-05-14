import type { ApiKeyScope } from '@nangohq/types';

export const remoteFunctionDryrunBaseScopes = [
    'environment:connections:read',
    'environment:integrations:read',
    'environment:proxy'
] as const satisfies readonly ApiKeyScope[];

export const remoteFunctionDeployScopes = ['environment:deploy'] as const satisfies readonly ApiKeyScope[];

export function buildDryrunSandboxScopes(callerScopes: string[] | undefined): ApiKeyScope[] {
    const scopes = new Set<string>();

    for (const scope of callerScopes ?? []) {
        scopes.add(scope);
    }

    for (const scope of remoteFunctionDryrunBaseScopes) {
        scopes.add(scope);
    }

    return Array.from(scopes) as ApiKeyScope[];
}
