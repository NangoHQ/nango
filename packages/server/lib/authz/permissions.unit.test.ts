import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { flags } from '@nangohq/utils';

import { buildPermissions } from './permissions.js';

describe('buildPermissions', () => {
    const originalFlag = flags.hasAuthRoles;
    beforeAll(() => {
        flags.hasAuthRoles = true;
    });
    afterAll(() => {
        flags.hasAuthRoles = originalFlag;
    });
    it('administrator should have all permissions true', async () => {
        const perms = await buildPermissions('administrator');
        for (const [key, value] of Object.entries(perms)) {
            expect(value, `Expected ${key} to be true for administrator`).toBe(true);
        }
    });

    it('production_support should deny team/billing/prod writes, allow prod reads', async () => {
        const perms = await buildPermissions('production_support');
        expect(perms['canManageTeam']).toBe(false);
        expect(perms['canManageBilling']).toBe(false);
        expect(perms['canCreateEnvironment']).toBe(false);
        expect(perms['canToggleIsProduction']).toBe(false);
        // prod writes denied
        expect(perms['canWriteProdIntegrations']).toBe(false);
        expect(perms['canWriteProdConnections']).toBe(false);
        expect(perms['canReadProdSecretKey']).toBe(false);
        expect(perms['canReadProdConnectionCredentials']).toBe(false);
        // prod read allowed
        expect(perms['canAccessProdEnvironment']).toBe(true);
    });

    it('development_full_access should deny all prod access', async () => {
        const perms = await buildPermissions('development_full_access');
        expect(perms['canManageTeam']).toBe(false);
        expect(perms['canAccessProdEnvironment']).toBe(false);
        expect(perms['canWriteProdIntegrations']).toBe(false);
        expect(perms['canReadProdSecretKey']).toBe(false);
        expect(perms['canReadProdConnectionCredentials']).toBe(false);
        expect(perms['canCreateEnvironment']).toBe(false);
    });
});
