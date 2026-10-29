import * as z from 'zod';

import { isEnvironmentScopeSelector, isRenamedToolsCallScope } from '@nangohq/authz';
import { metrics } from '@nangohq/utils';

import type { ApiKeyScope } from '@nangohq/types';

export const apiKeyScopeSchema = z.custom<ApiKeyScope>((value) => isEnvironmentScopeSelector(value) || isRenamedToolsCallScope(value), {
    error: (issue) => `Unknown scope: ${String(issue.input)}`
});

export function renameDeprecatedScopes(scopes: ApiKeyScope[], accountId: number): ApiKeyScope[] {
    if (!scopes.some(isRenamedToolsCallScope)) {
        return scopes;
    }
    metrics.increment(metrics.Types.DEPRECATED_API_KEY_SCOPE_USED, 1, { accountId });
    return [...new Set(scopes.map((scope) => (isRenamedToolsCallScope(scope) ? 'environment:tools:call' : scope)))];
}
