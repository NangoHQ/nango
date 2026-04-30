import { describe, expect, it } from 'vitest';

import { hasScope } from './scope.middleware.js';

import type { ApiKeyScope } from '@nangohq/types';

describe('hasScope', () => {
    it('returns false when grantedScopes is undefined', () => {
        expect(hasScope({ grantedScopes: undefined, requiredScope: 'environment:deploy' })).toBe(false);
    });

    it('exact match', () => {
        expect(hasScope({ grantedScopes: ['environment:deploy'], requiredScope: 'environment:deploy' })).toBe(true);
    });

    it('no match', () => {
        expect(hasScope({ grantedScopes: ['environment:deploy'], requiredScope: 'environment:proxy' })).toBe(false);
    });

    it('empty scopes returns false', () => {
        expect(hasScope({ grantedScopes: [], requiredScope: 'environment:deploy' })).toBe(false);
    });

    it('environment:* matches any environment scope', () => {
        expect(hasScope({ grantedScopes: ['environment:*'], requiredScope: 'environment:deploy' })).toBe(true);
        expect(hasScope({ grantedScopes: ['environment:*'], requiredScope: 'environment:integrations:list' })).toBe(true);
        expect(hasScope({ grantedScopes: ['environment:*'], requiredScope: 'environment:connections:read_credentials' })).toBe(true);
    });

    it('group wildcard matches scopes within the group', () => {
        expect(hasScope({ grantedScopes: ['environment:integrations:*'], requiredScope: 'environment:integrations:list' })).toBe(true);
        expect(hasScope({ grantedScopes: ['environment:integrations:*'], requiredScope: 'environment:integrations:write' })).toBe(true);
        expect(hasScope({ grantedScopes: ['environment:integrations:*'], requiredScope: 'environment:integrations:read_credentials' })).toBe(true);
    });

    it('group wildcard does not match other groups', () => {
        expect(hasScope({ grantedScopes: ['environment:integrations:*'], requiredScope: 'environment:connections:list' })).toBe(false);
        expect(hasScope({ grantedScopes: ['environment:integrations:*'], requiredScope: 'environment:deploy' })).toBe(false);
    });

    it('multiple granted scopes — any match is sufficient', () => {
        expect(hasScope({ grantedScopes: ['environment:deploy', 'environment:proxy'], requiredScope: 'environment:proxy' })).toBe(true);
    });

    it('wildcard does not match across prefixes', () => {
        // Cast to ApiKeyScope: account-level scopes are not yet supported, but we verify
        // that environment:* doesn't accidentally match them
        expect(hasScope({ grantedScopes: ['environment:*'], requiredScope: 'account:environments:create' as ApiKeyScope })).toBe(false);
    });

    it('credential scope does not grant non-credential access', () => {
        expect(hasScope({ grantedScopes: ['environment:connections:read_credentials'], requiredScope: 'environment:connections:write' })).toBe(false);
    });
});
