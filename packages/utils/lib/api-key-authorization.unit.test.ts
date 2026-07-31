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

describe('API key authorization', () => {
    it('matches account:* against granular account scopes', () => {
        expect(hasApiKeyScope({ grantedScopes: ['account:*'], requiredScope: 'account:billing:read' })).toBe(true);
        expect(hasApiKeyScope({ grantedScopes: ['account:*'], requiredScope: 'account:team:invite_member' })).toBe(true);
    });

    it('does not match wildcards across scope planes', () => {
        expect(hasApiKeyScope({ grantedScopes: ['account:*'], requiredScope: 'environment:connections:read' })).toBe(false);
        expect(hasApiKeyScope({ grantedScopes: ['environment:*'], requiredScope: 'account:billing:read' })).toBe(false);
    });

    it('uses account_id as the account target binding', () => {
        expect(canAccessApiKeyTarget(principal, { type: 'account', accountId: 10 })).toBe(true);
        expect(canAccessApiKeyTarget(principal, { type: 'account', accountId: 11 })).toBe(false);
    });

    it('requires an explicit environment binding', () => {
        expect(canAccessApiKeyTarget(principal, { type: 'environment', accountId: 10, environmentId: 100 })).toBe(true);
        expect(canAccessApiKeyTarget(principal, { type: 'environment', accountId: 10, environmentId: 101 })).toBe(false);
    });

    it('requires the scope plane to match the target plane', () => {
        expect(authorizeApiKey({ principal, requiredScope: 'account:billing:read', target: { type: 'account', accountId: 10 } })).toBe(true);
        expect(
            authorizeApiKey({
                principal,
                requiredScope: 'environment:connections:read',
                target: { type: 'account', accountId: 10 }
            })
        ).toBe(false);
    });
});
