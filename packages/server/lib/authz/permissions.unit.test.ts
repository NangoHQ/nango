import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { flags } from '@nangohq/utils';

import { buildPermissions } from './resolve.js';

import type { AllowedPermissions } from '@nangohq/types';

type Action = 'create' | 'read' | 'update' | 'delete' | '*';
type Scope = 'production' | 'non-production' | 'global';

function hasPermission(perms: AllowedPermissions, resource: string, scope: Scope, action: Action): boolean {
    return perms[resource]?.[scope]?.includes(action) ?? false;
}

describe('buildPermissions', () => {
    const originalFlag = flags.hasAuthRoles;
    beforeAll(() => {
        flags.hasAuthRoles = true;
    });
    afterAll(() => {
        flags.hasAuthRoles = originalFlag;
    });

    it('administrator should have all permissions', async () => {
        const perms = await buildPermissions('administrator');
        expect(hasPermission(perms, 'team', 'global', 'update')).toBe(true);
        expect(hasPermission(perms, 'billing', 'global', '*')).toBe(true);
        expect(hasPermission(perms, 'integration', 'production', 'update')).toBe(true);
        expect(hasPermission(perms, 'secret_key', 'production', 'read')).toBe(true);
        expect(hasPermission(perms, 'connection_credential', 'production', 'read')).toBe(true);
        expect(hasPermission(perms, 'environment', 'global', 'create')).toBe(true);
    });

    it('production_support should deny team/billing/prod writes, allow prod reads', async () => {
        const perms = await buildPermissions('production_support');
        // admin-only denied
        expect(hasPermission(perms, 'team', 'global', 'update')).toBe(false);
        expect(hasPermission(perms, 'billing', 'global', '*')).toBe(false);
        expect(hasPermission(perms, 'environment', 'global', 'create')).toBe(false);
        expect(hasPermission(perms, 'environment_production_flag', 'global', 'update')).toBe(false);
        // prod writes denied
        expect(hasPermission(perms, 'integration', 'production', 'update')).toBe(false);
        expect(hasPermission(perms, 'connection', 'production', 'update')).toBe(false);
        // prod secrets denied
        expect(hasPermission(perms, 'secret_key', 'production', 'read')).toBe(false);
        expect(hasPermission(perms, 'connection_credential', 'production', 'read')).toBe(false);
        // prod read allowed
        expect(hasPermission(perms, 'environment', 'production', 'read')).toBe(true);
    });

    it('development_full_access should deny all prod access', async () => {
        const perms = await buildPermissions('development_full_access');
        expect(hasPermission(perms, 'team', 'global', 'update')).toBe(false);
        expect(hasPermission(perms, 'environment', 'production', 'read')).toBe(false);
        expect(hasPermission(perms, 'integration', 'production', 'update')).toBe(false);
        expect(hasPermission(perms, 'secret_key', 'production', 'read')).toBe(false);
        expect(hasPermission(perms, 'connection_credential', 'production', 'read')).toBe(false);
        expect(hasPermission(perms, 'environment', 'global', 'create')).toBe(false);
    });
});
