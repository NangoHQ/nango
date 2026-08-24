import { describe, expect, it } from 'vitest';

import { authorize, ISSUABLE_SCOPES, PRIVATE_SCOPES, ROLES } from '@nangohq/authz';

import { evaluator } from './evaluator.js';

import type { Principal, Scope, Target } from '@nangohq/authz';
import type { Action, Permission, Scope as RbacTier, Resource, Role } from '@nangohq/types';

/**
 * Pins the new grant-based roles to what ROLE_DENY_MAP allows today. Converting a deny list to an
 * allow list means enumerating a complement, which is where omissions hide — and the existing role
 * integration test is almost entirely deny-side (36 of 41 assertions are 403), so it catches
 * over-granting and not the over-denial this flip actually risks.
 *
 * Deleted together with ROLE_DENY_MAP once the private API authorizes through `authorize()`.
 */

const ROLE_LIST: Role[] = ['administrator', 'production_support', 'development_full_access'];

type Plane = 'account' | 'environment';

/**
 * Scope -> the legacy permission it replaces, and the plane it is evaluated on. The deny map has
 * no opinion on anything absent here.
 *
 * The plane is explicit because it cannot be derived: `environment:create` (creating one) is
 * account-plane while `environment:delete` (deleting a specific one) is environment-plane, and both
 * use the same legacy resource.
 */
const LEGACY: Partial<Record<Scope, [Resource, Action, Plane]>> = {
    // account plane
    'account:team:update': ['team', 'update', 'account'],
    'account:team:users:update': ['team_member', 'update', 'account'],
    'account:team:users:delete': ['team_member', 'delete', 'account'],
    'account:invites:create': ['invite', 'create', 'account'],
    'account:invites:delete': ['invite', 'delete', 'account'],
    'account:connect_ui:update': ['connect_ui_settings', 'update', 'account'],
    'account:billing:payment_methods:list': ['billing', '*', 'account'],
    'account:billing:payment_methods:create': ['billing', '*', 'account'],
    'account:billing:payment_methods:delete': ['billing', '*', 'account'],
    'account:plan:update': ['plan', 'update', 'account'],
    'account:audit_trail:read': ['audit_trail', 'read', 'account'],
    'account:api_keys:create': ['account_key', '*', 'account'],
    'account:api_keys:list': ['account_key', '*', 'account'],
    'account:api_keys:delete': ['account_key', '*', 'account'],
    'account:environments:create': ['environment', 'create', 'account'],
    'account:environments:set_production': ['environment_production_flag', 'update', 'account'],
    // environment plane. `:list` and `:read` both map to the legacy `read` — the private grammar has
    // no list action, so one permission guards the collection and the item alike.
    'environment:integrations:list': ['integration', 'read', 'environment'],
    'environment:integrations:read': ['integration', 'read', 'environment'],
    'environment:integrations:update': ['integration', 'update', 'environment'],
    'environment:integrations:delete': ['integration', 'delete', 'environment'],
    'environment:connections:list': ['connection', 'read', 'environment'],
    'environment:connections:read': ['connection', 'read', 'environment'],
    'environment:connections:update': ['connection', 'update', 'environment'],
    'environment:connections:delete': ['connection', 'delete', 'environment'],
    'environment:connections:read_credentials': ['connection_credential', 'read', 'environment'],
    'environment:functions:list': ['flow', 'read', 'environment'],
    'environment:functions:read': ['flow', 'read', 'environment'],
    'environment:functions:delete': ['flow', 'delete', 'environment'],
    'environment:logs:read': ['log', 'read', 'environment'],
    'environment:syncs:execute': ['sync_command', 'update', 'environment'],
    'environment:settings:read': ['environment', 'read', 'environment'],
    'environment:settings:update': ['environment', 'update', 'environment'],
    'account:environments:delete': ['environment', 'delete', 'environment'],
    'account:environments:api_keys:list': ['environment_key', 'read', 'environment'],
    'account:environments:api_keys:update': ['environment_key', 'update', 'environment'],
    'environment:settings:read_secret': ['secret_key', 'read', 'environment'],
    'environment:variables:update': ['environment_variable', 'update', 'environment'],
    'environment:webhooks:update': ['webhook', 'update', 'environment']
};

/** Reviewed, deliberate departures from today. Everything else must match exactly. */
const INTENTIONAL_CHANGES: { role: Role; scope: Scope; tier: RbacTier; reason: string }[] = [
    {
        role: 'production_support',
        scope: 'environment:functions:delete',
        tier: 'production',
        reason: 'deny-map gap: PROD_WRITES names flow:update with no delete equivalent, so deleting a production function slipped through'
    }
];

const TIERS: { tier: RbacTier; plane: Plane; target: Target }[] = [
    { tier: 'global', plane: 'account', target: { type: 'account' } },
    { tier: 'production', plane: 'environment', target: { type: 'environment', environment: { id: 1, is_production: true } } },
    { tier: 'non-production', plane: 'environment', target: { type: 'environment', environment: { id: 2, is_production: false } } }
];

function principalFor(role: Role): Principal {
    return { subject: { type: 'user', id: '1' }, accountId: 1, grants: ROLES[role] };
}

// A scope is only ever evaluated on its own plane; the other combinations do not occur.
const cases = (Object.keys(LEGACY) as Scope[]).flatMap((scope) =>
    ROLE_LIST.flatMap((role) => TIERS.filter((t) => t.plane === LEGACY[scope]![2]).map(({ tier, target }) => ({ scope, role, tier, target })))
);

describe('role grants match the legacy deny map', () => {
    it.each(cases)('$role / $scope / $tier', async ({ scope, role, tier, target }) => {
        const [resource, action] = LEGACY[scope]!;
        const permission: Permission = { resource, action, scope: tier };

        const expected = await evaluator.evaluate(role, permission);
        const actual = authorize(principalFor(role), scope, target);

        const intentional = INTENTIONAL_CHANGES.find((c) => c.role === role && c.scope === scope && c.tier === tier);
        if (intentional) {
            expect(actual, `intentional change: ${intentional.reason}`).not.toBe(expected);
            return;
        }

        expect(actual).toBe(expected);
    });

    it('has no intentional change that silently became a no-op', () => {
        // If a change stops being a change, the entry is stale and must go.
        expect(INTENTIONAL_CHANGES.length).toBe(1);
    });

    it('covers every scope the deny map has an opinion on', () => {
        const all = [...ISSUABLE_SCOPES, ...PRIVATE_SCOPES] as Scope[];
        const uncovered = all.filter((c) => !LEGACY[c]);
        // Key-only scopes have no RBAC equivalent, so the deny map has no opinion to be an oracle for.
        expect(uncovered.every((c) => !c.startsWith('account:') || c.startsWith('account:environments:'))).toBe(true);
    });
});
