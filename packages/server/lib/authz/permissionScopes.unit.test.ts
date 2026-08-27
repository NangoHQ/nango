import { describe, expect, it } from 'vitest';

import { permissions } from '@nangohq/authz';

import { PERMISSION_BY_SCOPE, planeForPermission, scopesForPermission } from './permissionScopes.js';

import type { Scope } from '@nangohq/authz';
import type { Action, Permission, Scope as RbacTier, Resource } from '@nangohq/types';

const entries = Object.entries(PERMISSION_BY_SCOPE) as [Scope, [Resource, Action]][];
const TIERS: RbacTier[] = ['global', 'production', 'non-production'];

describe('scopesForPermission', () => {
    // The plane comes from the permission's tier, never from this table, so a scope must resolve the
    // same way whichever tier it is asked about.
    it.each(entries)('%s resolves back from the permission it replaces, on any tier', (scope, [resource, action]) => {
        for (const tier of TIERS) {
            const permission: Permission = { resource, action, scope: tier };
            expect(scopesForPermission(permission), tier).toContain(scope);
        }
    });

    it('returns every scope sharing a permission, since the legacy grammar has no list action', () => {
        expect(scopesForPermission({ resource: 'integration', action: 'read', scope: 'production' })).toEqual([
            'environment:integrations:list',
            'environment:integrations:read'
        ]);
    });

    /**
     * The round trip above derives its permission from the entry it asserts against, so it pins the
     * key format but not the mapping's content. These do the latter.
     */
    it.each([
        ['environment:webhooks:update', 'webhook', 'update'],
        ['environment:logs:read', 'log', 'read'],
        ['account:team:update', 'team', 'update'],
        ['account:environments:create', 'environment', 'create'],
        ['environment:delete', 'environment', 'delete'],
        ['environment:deploy', 'flow', 'update']
    ])('%s replaces %s/%s', (scope, resource, action) => {
        expect(PERMISSION_BY_SCOPE[scope as Scope]).toEqual([resource, action]);
    });

    /** Anything missing here is a permission authorization cannot resolve, on every request. */
    it('covers every permission a route can require', () => {
        const unmapped = Object.entries(permissions)
            .filter(([, permission]) => scopesForPermission(permission).length === 0)
            .map(([name]) => name);
        expect(unmapped).toEqual([]);
    });

    it('is empty where the new model has no equivalent', () => {
        expect(scopesForPermission({ resource: '*', action: '*', scope: 'global' })).toEqual([]);
    });

    it('reads both environment tiers on the environment plane', () => {
        expect(planeForPermission({ resource: 'log', action: 'read', scope: 'production' })).toBe('environment');
        expect(planeForPermission({ resource: 'log', action: 'read', scope: 'non-production' })).toBe('environment');
    });
});
