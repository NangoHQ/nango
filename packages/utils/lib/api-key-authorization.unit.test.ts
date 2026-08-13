import { describe, expect, it } from 'vitest';

import { authorizeApiKey, canAccessApiKeyTarget, hasApiKeyScope } from './api-key-authorization.js';

import type { ApiKeyPrincipal } from '@nangohq/types';

const principal: ApiKeyPrincipal = {
    type: 'api_key',
    source: 'customer_key',
    keyId: 1,
    accountId: 10,
    scopes: ['account:*', 'environment:connections:read'],
    environmentIds: [100]
};

describe('hasApiKeyScope', () => {
    it('returns false when grantedScopes is undefined', () => {
        expect(hasApiKeyScope({ grantedScopes: undefined, requiredScope: 'environment:deploy' })).toBe(false);
    });

    it('exact match', () => {
        expect(hasApiKeyScope({ grantedScopes: ['environment:deploy'], requiredScope: 'environment:deploy' })).toBe(true);
    });

    it('no match', () => {
        expect(hasApiKeyScope({ grantedScopes: ['environment:deploy'], requiredScope: 'environment:proxy' })).toBe(false);
    });

    it('empty scopes returns false', () => {
        expect(hasApiKeyScope({ grantedScopes: [], requiredScope: 'environment:deploy' })).toBe(false);
    });

    it('environment:* matches any environment scope', () => {
        expect(hasApiKeyScope({ grantedScopes: ['environment:*'], requiredScope: 'environment:deploy' })).toBe(true);
        expect(hasApiKeyScope({ grantedScopes: ['environment:*'], requiredScope: 'environment:integrations:list' })).toBe(true);
        expect(hasApiKeyScope({ grantedScopes: ['environment:*'], requiredScope: 'environment:connections:read_credentials' })).toBe(true);
        expect(hasApiKeyScope({ grantedScopes: ['environment:*'], requiredScope: 'environment:logs:read' })).toBe(true);
    });

    it('group wildcard matches scopes within the group', () => {
        expect(hasApiKeyScope({ grantedScopes: ['environment:integrations:*'], requiredScope: 'environment:integrations:list' })).toBe(true);
        expect(hasApiKeyScope({ grantedScopes: ['environment:integrations:*'], requiredScope: 'environment:integrations:create' })).toBe(true);
        expect(hasApiKeyScope({ grantedScopes: ['environment:integrations:*'], requiredScope: 'environment:integrations:read_credentials' })).toBe(true);
    });

    it('group wildcard does not match other groups', () => {
        expect(hasApiKeyScope({ grantedScopes: ['environment:integrations:*'], requiredScope: 'environment:connections:list' })).toBe(false);
        expect(hasApiKeyScope({ grantedScopes: ['environment:integrations:*'], requiredScope: 'environment:deploy' })).toBe(false);
    });

    it('multiple granted scopes — any match is sufficient', () => {
        expect(hasApiKeyScope({ grantedScopes: ['environment:deploy', 'environment:proxy'], requiredScope: 'environment:proxy' })).toBe(true);
    });

    it('wildcard does not match across prefixes', () => {
        expect(hasApiKeyScope({ grantedScopes: ['environment:*'], requiredScope: 'account:environments:create' })).toBe(false);
        expect(hasApiKeyScope({ grantedScopes: ['account:*'], requiredScope: 'environment:deploy' })).toBe(false);
    });

    it('credential scope does not grant non-credential access', () => {
        expect(hasApiKeyScope({ grantedScopes: ['environment:connections:read_credentials'], requiredScope: 'environment:connections:update' })).toBe(false);
    });

    it('matches account:* against granular account scopes', () => {
        expect(hasApiKeyScope({ grantedScopes: ['account:*'], requiredScope: 'account:environments:create' })).toBe(true);
        expect(hasApiKeyScope({ grantedScopes: ['account:*'], requiredScope: 'account:environments:delete' })).toBe(true);
        expect(hasApiKeyScope({ grantedScopes: ['account:*'], requiredScope: 'account:environments:set_production' })).toBe(true);
    });
});

describe('API key authorization', () => {
    it('uses account_id as the account target binding', () => {
        expect(canAccessApiKeyTarget(principal, { type: 'account', accountId: 10 })).toBe(true);
        expect(canAccessApiKeyTarget(principal, { type: 'account', accountId: 11 })).toBe(false);
    });

    it('requires an explicit environment binding', () => {
        expect(canAccessApiKeyTarget(principal, { type: 'environment', accountId: 10, environmentId: 100 })).toBe(true);
        expect(canAccessApiKeyTarget(principal, { type: 'environment', accountId: 10, environmentId: 101 })).toBe(false);
    });

    it('requires the scope plane to match the target plane', () => {
        expect(authorizeApiKey({ principal, requiredScope: 'account:environments:create', target: { type: 'account', accountId: 10 } })).toBe(true);
        expect(
            authorizeApiKey({
                principal,
                requiredScope: 'environment:connections:read',
                target: { type: 'account', accountId: 10 }
            })
        ).toBe(false);
    });
});
