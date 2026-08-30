import { describe, expect, it } from 'vitest';

import { accountTarget, authorize, environmentTarget, ISSUABLE_SCOPES, PRIVATE_SCOPES, ROLES } from '@nangohq/authz';

import { evaluator } from './evaluator.js';
import { LEGACY_SCOPES } from './legacyScopes.js';

import type { Plane } from './legacyScopes.js';
import type { Principal, Scope, Target } from '@nangohq/authz';
import type { Permission, Scope as RbacTier, Role } from '@nangohq/types';

/**
 * Pins the new grant-based roles to what ROLE_DENY_MAP allows today. Converting a deny list to an
 * allow list means enumerating a complement, which is where omissions hide — and the existing role
 * integration test is almost entirely deny-side (36 of 41 assertions are 403), so it catches
 * over-granting and not the over-denial this flip actually risks.
 *
 * Deleted together with ROLE_DENY_MAP once the private API authorizes through `authorize()`.
 */

const ROLE_LIST: Role[] = ['administrator', 'production_support', 'development_full_access'];

/** Reviewed, deliberate departures from today. Everything else must match exactly. */
const INTENTIONAL_CHANGES: { role: Role; scope: Scope; tier: RbacTier; wasAllowed: boolean; nowAllowed: boolean; reason: string }[] = [
    {
        role: 'production_support',
        scope: 'environment:functions:delete',
        tier: 'production',
        wasAllowed: true,
        nowAllowed: false,
        reason: 'deny-map gap: PROD_WRITES names flow:update with no delete equivalent, so deleting a production function slipped through'
    }
];

const TIERS: { tier: RbacTier; plane: Plane; target: Target }[] = [
    { tier: 'global', plane: 'account', target: accountTarget(1) },
    { tier: 'production', plane: 'environment', target: environmentTarget({ id: 1, account_id: 1, is_production: true }) },
    { tier: 'non-production', plane: 'environment', target: environmentTarget({ id: 2, account_id: 1, is_production: false }) }
];

function principalFor(role: Role): Principal {
    return { subject: { type: 'user', id: '1' }, accountId: 1, grants: ROLES[role] };
}

// A scope is only ever evaluated on its own plane, and the namespace is what says which.
const planeOf = (scope: Scope): Plane => (scope.startsWith('account:') ? 'account' : 'environment');

// A scope is only ever evaluated on its own plane; the other combinations do not occur.
const cases = (Object.keys(LEGACY_SCOPES) as Scope[]).flatMap((scope) =>
    ROLE_LIST.flatMap((role) => TIERS.filter((t) => t.plane === planeOf(scope)).map(({ tier, target }) => ({ scope, role, tier, target })))
);

describe('role grants match the legacy deny map', () => {
    it.each(cases)('$role / $scope / $tier', async ({ scope, role, tier, target }) => {
        const [resource, action] = LEGACY_SCOPES[scope]!;
        const permission: Permission = { resource, action, scope: tier };

        const expected = await evaluator.evaluate(role, permission);
        const actual = authorize(principalFor(role), scope, target);

        const intentional = INTENTIONAL_CHANGES.find((c) => c.role === role && c.scope === scope && c.tier === tier);
        if (intentional) {
            expect(expected, `legacy behaviour moved: ${intentional.reason}`).toBe(intentional.wasAllowed);
            expect(actual, `intentional change: ${intentional.reason}`).toBe(intentional.nowAllowed);
            return;
        }

        expect(actual).toBe(expected);
    });

    it('has no intentional change that no longer applies to a real case', () => {
        const stale = INTENTIONAL_CHANGES.filter((c) => !cases.some((k) => k.role === c.role && k.scope === c.scope && k.tier === c.tier));
        expect(stale).toEqual([]);
    });

    it('covers every scope the deny map has an opinion on', () => {
        const all = [...ISSUABLE_SCOPES, ...PRIVATE_SCOPES] as Scope[];
        const uncovered = all.filter((c) => !LEGACY_SCOPES[c]);
        // Key-only scopes have no RBAC equivalent, so the deny map has no opinion to be an oracle for.
        expect(uncovered.every((c) => !c.startsWith('account:') || c.startsWith('account:environments:'))).toBe(true);
    });
});
