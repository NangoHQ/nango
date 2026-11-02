import { afterEach, describe, expect, it, vi } from 'vitest';

import { metrics } from '@nangohq/utils';

import { apiKeyScopeSchema, renameDeprecatedScopes } from './apiKeyScopes.js';

describe('apiKeyScopeSchema', () => {
    it.each(['environment:tools:call', 'environment:actions:execute', 'environment:actions:*', 'environment:*'])('accepts %s', (scope) => {
        expect(apiKeyScopeSchema.safeParse(scope).success).toBe(true);
    });

    it.each(['environment:actions:nope', 'environment:settings:read', 'account:*'])('rejects %s', (scope) => {
        expect(apiKeyScopeSchema.safeParse(scope).success).toBe(false);
    });
});

describe('renameDeprecatedScopes', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('stores the old names under environment:tools:call and counts it', () => {
        const increment = vi.spyOn(metrics, 'increment');

        expect(renameDeprecatedScopes(['environment:deploy', 'environment:actions:*', 'environment:tools:call'], 1)).toEqual([
            'environment:deploy',
            'environment:tools:call'
        ]);
        expect(increment).toHaveBeenCalledWith(metrics.Types.DEPRECATED_API_KEY_SCOPE_USED, 1, { accountId: 1 });
    });

    it('leaves current names alone without counting', () => {
        const increment = vi.spyOn(metrics, 'increment');

        expect(renameDeprecatedScopes(['environment:deploy'], 1)).toEqual(['environment:deploy']);
        expect(increment).not.toHaveBeenCalled();
    });
});
