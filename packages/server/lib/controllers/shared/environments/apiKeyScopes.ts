import * as z from 'zod';

import { isEnvironmentScopeSelector } from '@nangohq/authz';
import { metrics } from '@nangohq/utils';

import type { ApiKeyScope } from '@nangohq/types';

/** Old names of `environment:tools:call`, still accepted on input and stored under the new name. */
function isRenamedScope(value: unknown): boolean {
    return value === 'environment:actions:execute' || value === 'environment:actions:*';
}

export const apiKeyScopeSchema = z.custom<ApiKeyScope>((value) => isEnvironmentScopeSelector(value) || isRenamedScope(value), {
    error: (issue) => `Unknown scope: ${String(issue.input)}`
});

export function renameDeprecatedScopes(scopes: ApiKeyScope[], accountId: number): ApiKeyScope[] {
    if (!scopes.some(isRenamedScope)) {
        return scopes;
    }
    metrics.increment(metrics.Types.DEPRECATED_API_KEY_SCOPE_USED, 1, { accountId });
    return [...new Set(scopes.map((scope) => (isRenamedScope(scope) ? 'environment:tools:call' : scope)))];
}
