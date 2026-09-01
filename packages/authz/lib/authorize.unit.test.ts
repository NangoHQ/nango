import { describe, expect, it } from 'vitest';

import { authorize, authorizeIn, issuedGrant, scopeMatches } from './authorize.js';
import { ROLES } from './roles.js';
import { expandIssuable, ISSUABLE_SCOPES, PRIVATE_SCOPES } from './scopes.js';
import { accountTarget, environmentTarget, isIssuableWhere, ScopeRequiresEnvironmentError, targetForScope, whereContains } from './where.js';

import type { Grant, Principal } from './authorize.js';
import type { ScopeSelector } from './scopes.js';
import type { Target, WhereSelector } from './where.js';

const prodEnv: Target = environmentTarget({ id: 5, account_id: 1, is_production: true });
const devEnv: Target = environmentTarget({ id: 9, account_id: 1, is_production: false });
const account: Target = accountTarget(1);

function principal(grants: Grant[]): Principal {
    return { subject: { type: 'user', id: '1' }, accountId: 1, grants };
}

describe('whereContains', () => {
    it.each([
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

    it('nests: env:5 ⊆ env:production ⊆ env:*', () => {
        for (const where of ['env:5', 'env:production', 'env:*'] as const) {
            expect(whereContains(where, prodEnv)).toBe(true);
        }
    });
});

describe('scopeMatches', () => {
    it('matches exactly', () => {
        expect(scopeMatches(['environment:connections:read'], 'environment:connections:read')).toBe(true);
        expect(scopeMatches(['environment:connections:read'], 'environment:connections:delete')).toBe(false);
    });

    it('a namespace wildcard reaches non-issuable scopes — roles are not customer credentials', () => {
        expect(scopeMatches(['environment:*'], 'environment:settings:read_secret')).toBe(true);
        expect(scopeMatches(['account:*'], 'account:billing:payment_methods:create')).toBe(true);
    });

    it('a namespace wildcard does not cross into the other namespace', () => {
        expect(scopeMatches(['environment:*'], 'account:billing:payment_methods:create')).toBe(false);
        expect(scopeMatches(['account:*'], 'environment:connections:read')).toBe(false);
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
                expect(ISSUABLE_SCOPES, scope).toContain(scope);
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
            { can: ['environment:*'], where: ['env:non-production'] }
        ]);
        expect(authorize(p, 'environment:connections:delete', prodEnv)).toBe(false);
        expect(authorize(p, 'environment:connections:delete', devEnv)).toBe(true);
    });

    it('an account scope does not leak to an environment target, or the reverse', () => {
        const p = principal([{ can: ['account:environments:create'], where: ['account'] }]);
        expect(authorize(p, 'account:environments:create', account)).toBe(true);
        expect(authorize(p, 'account:environments:create', prodEnv)).toBe(false);
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
    });
});

describe('roles are not filtered', () => {
    it('a role reaches non-issuable scopes — its grants are hard-coded, not issued', () => {
        expect(authorize(principal(ROLES.administrator), 'environment:settings:read_secret', prodEnv)).toBe(true);
        expect(authorize(principal(ROLES.administrator), 'account:billing:payment_methods:create', account)).toBe(true);
    });
});

describe('account isolation', () => {
    const admin = principal(ROLES.administrator);

    it('refuses a target in another account, however broad the grant', () => {
        expect(authorize(admin, 'environment:connections:read', environmentTarget({ id: 5, account_id: 2, is_production: true }))).toBe(false);
        expect(authorize(admin, 'account:team:update', accountTarget(2))).toBe(false);
    });

    it('still allows the same target in its own account', () => {
        expect(authorize(admin, 'environment:connections:read', environmentTarget({ id: 5, account_id: 1, is_production: true }))).toBe(true);
    });

    it('environmentTarget takes the account from the environment row', () => {
        expect(environmentTarget({ id: 5, account_id: 7, is_production: false })).toEqual({
            type: 'environment',
            accountId: 7,
            environment: { id: 5, is_production: false }
        });
    });
});

describe('authorizeIn', () => {
    const p = principal([{ can: ['environment:*'], where: ['env:non-production'] }]);

    it('answers against the environment it is given', () => {
        expect(authorizeIn(p, 'environment:settings:update', { id: 9, account_id: 1, is_production: false })).toBe(true);
        expect(authorizeIn(p, 'environment:settings:update', { id: 5, account_id: 1, is_production: true })).toBe(false);
    });

    it('answers an account scope whatever environment it is handed', () => {
        expect(authorizeIn(principal([{ can: ['account:*'], where: ['account'] }]), 'account:team:update', { id: 5, account_id: 1, is_production: true })).toBe(
            true
        );
    });
});

describe('issuedGrant', () => {
    const issued = (scopes: ScopeSelector[], where: WhereSelector[]): Principal => ({
        subject: { type: 'api_key', id: '1' },
        accountId: 1,
        grants: [issuedGrant(scopes, where)]
    });

    it('resolves a wildcard to public scopes only', () => {
        const key = issued(['environment:*'], ['env:5']);
        expect(authorize(key, 'environment:connections:read', prodEnv)).toBe(true);
        expect(authorize(key, 'environment:settings:read_secret', prodEnv)).toBe(false);
    });

    it('cannot reach a private scope under a shared prefix', () => {
        const key = issued(['environment:variables:*'], ['env:5']);
        expect(authorize(key, 'environment:variables:read', prodEnv)).toBe(true);
        expect(authorize(key, 'environment:variables:update', prodEnv)).toBe(false);
    });

    it('drops tier selectors, so its reach cannot move', () => {
        const key = issued(['environment:*'], ['env:production']);
        expect(authorize(key, 'environment:connections:read', prodEnv)).toBe(false);
    });

    it.each(PRIVATE_SCOPES)('no wildcard a key may hold reaches private scope %s', (scope) => {
        const widest = issued(['environment:*', 'account:*'], ['env:5', 'account']);
        expect(authorize(widest, scope, prodEnv)).toBe(false);
        expect(authorize(widest, scope, account)).toBe(false);
    });

    it('keeps a concrete environment selector', () => {
        const key = issued(['environment:*'], ['env:5']);
        expect(authorize(key, 'environment:connections:read', prodEnv)).toBe(true);
        expect(authorize(key, 'environment:connections:read', devEnv)).toBe(false);
    });
});

describe('targetForScope', () => {
    const prodRow = { id: 5, account_id: 1, is_production: true };

    it('sends an account scope to the account, whatever environment is in view', () => {
        expect(targetForScope('account:team:update', 1, null)).toEqual({ type: 'account', accountId: 1 });
        expect(targetForScope('account:team:update', 1, prodRow)).toEqual({ type: 'account', accountId: 1 });
    });

    it('sends an environment scope to the environment it is asked about', () => {
        expect(targetForScope('environment:settings:update', 1, prodRow)).toEqual({
            type: 'environment',
            accountId: 1,
            environment: { id: 5, is_production: true }
        });
    });

    it('refuses an environment scope with no environment, naming the scope', () => {
        expect(() => targetForScope('environment:settings:update', 1, null)).toThrow(ScopeRequiresEnvironmentError);
        try {
            targetForScope('environment:settings:update', 1, null);
            expect.unreachable();
        } catch (err) {
            expect((err as ScopeRequiresEnvironmentError).message).toBe('scope_requires_environment');
            expect((err as ScopeRequiresEnvironmentError).name).toBe('ScopeRequiresEnvironmentError');
            expect((err as ScopeRequiresEnvironmentError).scope).toBe('environment:settings:update');
        }
    });

    it('takes the account from the environment row', () => {
        expect(targetForScope('environment:settings:update', 999, prodRow)).toMatchObject({ accountId: 1 });
    });

    it('names a real environment, so a grant scoped to one answers for it', () => {
        const principal: Principal = { subject: { type: 'user', id: 'u' }, accountId: 1, grants: [{ can: ['environment:*'], where: ['env:5'] }] };
        expect(authorize(principal, 'environment:settings:update', targetForScope('environment:settings:update', 1, prodRow))).toBe(true);
        expect(authorize(principal, 'environment:settings:update', targetForScope('environment:settings:update', 1, { ...prodRow, id: 6 }))).toBe(false);
    });
});
