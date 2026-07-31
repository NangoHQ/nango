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
        expect(hasScope({ grantedScopes: ['environment:*'], requiredScope: 'environment:logs:read' })).toBe(true);
    });

    it('group wildcard matches scopes within the group', () => {
        expect(hasScope({ grantedScopes: ['environment:integrations:*'], requiredScope: 'environment:integrations:list' })).toBe(true);
        expect(hasScope({ grantedScopes: ['environment:integrations:*'], requiredScope: 'environment:integrations:create' })).toBe(true);
        expect(hasScope({ grantedScopes: ['environment:integrations:*'], requiredScope: 'environment:integrations:read_credentials' })).toBe(true);
    });

    it('group wildcard does not match other groups', () => {
        expect(hasScope({ grantedScopes: ['environment:integrations:*'], requiredScope: 'environment:connections:list' })).toBe(false);
        expect(hasScope({ grantedScopes: ['environment:integrations:*'], requiredScope: 'environment:deploy' })).toBe(false);
    });

    it('multiple granted scopes — any match is sufficient', () => {
        expect(hasScope({ grantedScopes: ['environment:deploy', 'environment:proxy'], requiredScope: 'environment:proxy' })).toBe(true);
    });

    it('credential scope does not grant non-credential access', () => {
        expect(hasScope({ grantedScopes: ['environment:connections:read_credentials'], requiredScope: 'environment:connections:update' })).toBe(false);
    });

    // The prefix is the plane tag, and prefix matching is the only thing keeping the two planes
    // apart. If this breaks, an environment key authorizes account operations.
    describe('plane isolation', () => {
        it('environment:* does not grant any account scope', () => {
            expect(hasScope({ grantedScopes: ['environment:*'], requiredScope: 'account:*' })).toBe(false);
            expect(hasScope({ grantedScopes: ['environment:*'], requiredScope: 'account:team:read' })).toBe(false);
        });

        it('account:* does not grant any environment scope', () => {
            expect(hasScope({ grantedScopes: ['account:*'], requiredScope: 'environment:*' })).toBe(false);
            expect(hasScope({ grantedScopes: ['account:*'], requiredScope: 'environment:connections:read' })).toBe(false);
            expect(hasScope({ grantedScopes: ['account:*'], requiredScope: 'environment:deploy' })).toBe(false);
        });

        it('account:* grants account scopes', () => {
            expect(hasScope({ grantedScopes: ['account:*'], requiredScope: 'account:team:read' })).toBe(true);
        });

        it('a specific account scope does not grant its siblings', () => {
            expect(hasScope({ grantedScopes: ['account:team:read'], requiredScope: 'account:team:read' })).toBe(true);
            expect(hasScope({ grantedScopes: ['account:team:read'], requiredScope: 'account:*' as ApiKeyScope })).toBe(false);
        });
    });
});
