import { describe, expect, it } from 'vitest';

import {
    expandIssuable,
    isAccountScopeSelector,
    isEnvironmentScopeSelector,
    ISSUABLE_SCOPES,
    PRIVATE_SCOPES,
    PUBLIC_ACCOUNT_SCOPES,
    PUBLIC_ENVIRONMENT_SCOPES
} from './scopes.js';

import type { ScopeSelector } from './scopes.js';

const JUNK = [null, undefined, 42, true, '', 'environment', 'environment:', 'account:', {}, ['environment:*']];

describe('isEnvironmentScopeSelector', () => {
    it.each(PUBLIC_ENVIRONMENT_SCOPES)('accepts %s', (scope) => {
        expect(isEnvironmentScopeSelector(scope)).toBe(true);
    });

    it.each(PRIVATE_SCOPES)('rejects the private scope %s', (scope) => {
        expect(isEnvironmentScopeSelector(scope)).toBe(false);
    });

    it.each(PUBLIC_ACCOUNT_SCOPES)('rejects %s, which is in the other namespace', (scope) => {
        expect(isEnvironmentScopeSelector(scope)).toBe(false);
    });

    it.each([
        ['environment:*', true],
        ['environment:connections:*', true],
        ['environment:integrations:*', true],
        ['environment:syncs:*', true],
        ['environment:variables:*', true],
        ['environment:settings:*', false],
        ['environment:nope:*', false],
        ['environment:conn*', false],
        ['*', false],
        ['account:*', false]
    ])('%s -> %s', (value, expected) => {
        expect(isEnvironmentScopeSelector(value)).toBe(expected);
    });

    it.each(JUNK)('rejects %o', (value) => {
        expect(isEnvironmentScopeSelector(value)).toBe(false);
    });
});

describe('isAccountScopeSelector', () => {
    it.each(PUBLIC_ACCOUNT_SCOPES)('accepts %s', (scope) => {
        expect(isAccountScopeSelector(scope)).toBe(true);
    });

    it.each(PRIVATE_SCOPES)('rejects the private scope %s', (scope) => {
        expect(isAccountScopeSelector(scope)).toBe(false);
    });

    it.each(PUBLIC_ENVIRONMENT_SCOPES)('rejects %s, which is in the other namespace', (scope) => {
        expect(isAccountScopeSelector(scope)).toBe(false);
    });

    it.each([
        ['account:*', true],
        ['account:environments:*', true],
        ['account:environments:api_keys:*', true],
        ['account:team:*', false],
        ['account:billing:*', false],
        ['account:nope:*', false],
        ['*', false],
        ['environment:*', false]
    ])('%s -> %s', (value, expected) => {
        expect(isAccountScopeSelector(value)).toBe(expected);
    });

    it.each(JUNK)('rejects %o', (value) => {
        expect(isAccountScopeSelector(value)).toBe(false);
    });
});

describe('what a key may hold', () => {
    const everyWildcard = () => {
        const out = new Set<string>();
        for (const scope of [...ISSUABLE_SCOPES, ...PRIVATE_SCOPES]) {
            const parts = scope.split(':');
            for (let i = 1; i < parts.length; i++) {
                out.add(`${parts.slice(0, i).join(':')}:*`);
            }
        }
        return [...out];
    };

    it('accepts a wildcard exactly when it resolves to something a key may hold', () => {
        for (const wildcard of everyWildcard()) {
            const accepted = isEnvironmentScopeSelector(wildcard) || isAccountScopeSelector(wildcard);
            const resolves = expandIssuable([wildcard as ScopeSelector]).length > 0;
            expect(accepted, wildcard).toBe(resolves);
        }
    });

    it('never accepts a scope that is not issuable', () => {
        for (const scope of PRIVATE_SCOPES) {
            expect(isEnvironmentScopeSelector(scope) || isAccountScopeSelector(scope), scope).toBe(false);
        }
    });
});
