import { describe, expect, it } from 'vitest';

import { permissions } from '@nangohq/authz';

import { LEGACY_SCOPES, planeForPermission, scopesForPermission } from './legacyScopes.js';

import type { Plane } from './legacyScopes.js';
import type { Scope } from '@nangohq/authz';
import type { Action, Permission, Scope as RbacTier, Resource } from '@nangohq/types';

const entries = Object.entries(LEGACY_SCOPES) as [Scope, [Resource, Action, Plane]][];
const tierFor = (plane: Plane): RbacTier => (plane === 'account' ? 'global' : 'production');

describe('scopesForPermission', () => {
    it.each(entries)('%s resolves back from the permission it replaces', (scope, [resource, action, plane]) => {
        const permission: Permission = { resource, action, scope: tierFor(plane) };
        expect(scopesForPermission(permission)).toContain(scope);
        expect(planeForPermission(permission)).toBe(plane);
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
        ['environment:webhooks:update', 'webhook', 'update', 'environment'],
        ['environment:logs:read', 'log', 'read', 'environment'],
        ['account:team:update', 'team', 'update', 'account'],
        ['account:environments:create', 'environment', 'create', 'account'],
        ['account:environments:delete', 'environment', 'delete', 'environment'],
        ['environment:deploy', 'flow', 'update', 'environment']
    ])('%s replaces %s/%s on the %s plane', (scope, resource, action, plane) => {
        expect(LEGACY_SCOPES[scope as Scope]).toEqual([resource, action, plane]);
    });

    /** Anything missing here is a permission shadow evaluation can never compare, on every request. */
    it('covers every permission the deny map has an opinion on', () => {
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
