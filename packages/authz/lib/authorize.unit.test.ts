import { describe, expect, it } from 'vitest';

import { authorize, authorizeAny, scopeMatches } from './authorize.js';
import { ROLES } from './roles.js';
import { expandIssuable, isIssuable, ISSUABLE_SCOPES, PRIVATE_SCOPES } from './scopes.js';
import { isIssuableWhere, whereContains } from './where.js';

import type { Grant, Principal } from './authorize.js';
import type { Target } from './where.js';

const prodEnv: Target = { type: 'environment', environment: { id: 5, is_production: true } };
const devEnv: Target = { type: 'environment', environment: { id: 9, is_production: false } };
const account: Target = { type: 'account' };

function principal(grants: Grant[]): Principal {
    return { subject: { type: 'api_key', id: '1' }, accountId: 1, grants };
}

describe('whereContains', () => {
    it.each([
        ['*', prodEnv, true],
        ['*', account, true],
        ['account', account, true],
        ['account', prodEnv, false],
        ['env:*', prodEnv, true],
        ['env:*', account, false],
        ['env:production', prodEnv, true],
        ['env:production', devEnv, false],
        ['env:non-production', devEnv, true],
        ['env:non-production', prodEnv, false],
        ['env:5', prodEnv, true],
        ['env:9', prodEnv, false]
    ] as const)('%s contains %o -> %s', (where, target, expected) => {
        expect(whereContains(where, target)).toBe(expected);
    });

    it('nests: env:5 ⊆ env:production ⊆ env:* ⊆ *', () => {
        for (const where of ['env:5', 'env:production', 'env:*', '*'] as const) {
            expect(whereContains(where, prodEnv)).toBe(true);
        }
    });
});

describe('scopeMatches', () => {
    it('matches exactly', () => {
        expect(scopeMatches(['environment:connections:read'], 'environment:connections:read')).toBe(true);
        expect(scopeMatches(['environment:connections:read'], 'environment:connections:delete')).toBe(false);
    });

    it('bare * matches anything, including non-issuable scopes — roles are not customer credentials', () => {
        expect(scopeMatches(['*'], 'environment:settings:read_secret')).toBe(true);
        expect(scopeMatches(['*'], 'account:billing:payment_methods:create')).toBe(true);
    });

    it('a prefix wildcard matches issuable scopes under it', () => {
        expect(scopeMatches(['environment:connections:*'], 'environment:connections:delete')).toBe(true);
        expect(scopeMatches(['environment:*'], 'environment:connections:delete')).toBe(true);
        expect(scopeMatches(['environment:*'], 'account:environments:create')).toBe(false);
    });

    it('a prefix wildcard reaches a sub-resource', () => {
        expect(scopeMatches(['account:team:*'], 'account:team:users:update')).toBe(true);
        expect(scopeMatches(['environment:*'], 'environment:settings:read_secret')).toBe(true);
    });
});

describe('expandIssuable', () => {
    // environment:* is the default scope on every customer key, so without this the private
    // scopes added by the RBAC merge would land in every key at once.
    it('covers the public scopes and no private one', () => {
        const expanded = expandIssuable(['environment:*']);
        expect(expanded).toContain('environment:connections:read');
        expect(expanded).not.toContain('environment:settings:update');
        expect(expanded).not.toContain('environment:settings:read_secret');
    });

    it('never yields a private scope, whatever was granted', () => {
        for (const granted of [['*'], ['environment:*'], ['account:*'], PRIVATE_SCOPES] as const) {
            for (const scope of expandIssuable(granted as never)) {
                expect(isIssuable(scope), scope).toBe(true);
            }
        }
    });

    it('keeps every issuable scope the wildcard covers', () => {
        for (const scope of ISSUABLE_SCOPES) {
            const wildcard = scope.startsWith('account:') ? 'account:*' : 'environment:*';
            expect(expandIssuable([wildcard]), scope).toContain(scope);
        }
    });

    it('a key cannot reach a private scope even by naming it directly', () => {
        expect(expandIssuable(['environment:settings:read_secret'])).toEqual([]);
    });
});

describe('authorize', () => {
    it('requires both the scope and the target to match', () => {
        const p = principal([{ can: ['environment:connections:read'], where: ['env:5'] }]);
        expect(authorize(p, 'environment:connections:read', prodEnv)).toBe(true);
        expect(authorize(p, 'environment:connections:read', devEnv)).toBe(false);
        expect(authorize(p, 'environment:connections:delete', prodEnv)).toBe(false);
    });

    it('the where array is a union', () => {
        const p = principal([{ can: ['environment:connections:read'], where: ['env:5', 'env:9'] }]);
        expect(authorize(p, 'environment:connections:read', prodEnv)).toBe(true);
        expect(authorize(p, 'environment:connections:read', devEnv)).toBe(true);
    });

    it('grants are additive — any match allows', () => {
        const p = principal([
            { can: ['environment:connections:read'], where: ['env:production'] },
            { can: ['*'], where: ['env:non-production'] }
        ]);
        expect(authorize(p, 'environment:connections:delete', prodEnv)).toBe(false);
        expect(authorize(p, 'environment:connections:delete', devEnv)).toBe(true);
    });

    it('an account scope does not leak to an environment target, or the reverse', () => {
        const p = principal([{ can: ['account:environments:create'], where: ['account'] }]);
        expect(authorize(p, 'account:environments:create', account)).toBe(true);
        expect(authorize(p, 'account:environments:create', prodEnv)).toBe(false);
    });

    it('authorizeAny is any-of', () => {
        const p = principal([{ can: ['environment:connections:read_credentials'], where: ['env:*'] }]);
        expect(authorizeAny(p, ['environment:connections:read', 'environment:connections:read_credentials'], prodEnv)).toBe(true);
        expect(authorizeAny(p, ['environment:connections:read', 'environment:connections:delete'], prodEnv)).toBe(false);
    });
});

describe('isIssuableWhere', () => {
    // A key bound to a tier would gain or lose environments when an administrator toggles
    // is_production — its reach must not change under it.
    it('allows concrete environments and the account, not tiers', () => {
        expect(isIssuableWhere('env:5')).toBe(true);
        expect(isIssuableWhere('account')).toBe(true);
        expect(isIssuableWhere('env:production')).toBe(false);
        expect(isIssuableWhere('env:non-production')).toBe(false);
        expect(isIssuableWhere('env:*')).toBe(false);
        expect(isIssuableWhere('*')).toBe(false);
    });
});

describe('roles are not filtered', () => {
    it('a role reaches non-issuable scopes — its grants are hard-coded, not issued', () => {
        expect(authorize(principal(ROLES.administrator), 'environment:settings:read_secret', prodEnv)).toBe(true);
        expect(authorize(principal(ROLES.administrator), 'account:billing:payment_methods:create', account)).toBe(true);
    });
});
