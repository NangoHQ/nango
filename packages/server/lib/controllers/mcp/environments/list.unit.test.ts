import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { flags } from '@nangohq/utils';

import { getAuthorizedManagementMcpEnvironments, listEnvironmentsTool } from './list.js';

import type { DBPlan, DBTeam, DBUser } from '@nangohq/types';

const { getEnvironmentsMock } = vi.hoisted(() => ({ getEnvironmentsMock: vi.fn() }));

vi.mock('@nangohq/shared', () => ({
    environmentService: { getEnvironmentsByAccountId: getEnvironmentsMock }
}));

const originalHasAuthRoles = flags.hasAuthRoles;
const account = { id: 42 } as DBTeam;
const plan = { has_rbac: true } as DBPlan;
const environments = [
    { id: 1, uuid: 'dev', name: 'dev', is_production: false },
    { id: 2, uuid: 'prod', name: 'prod', is_production: true }
];

describe('environments_list', () => {
    beforeEach(() => {
        flags.hasAuthRoles = true;
        getEnvironmentsMock.mockResolvedValue(environments);
    });

    afterEach(() => {
        flags.hasAuthRoles = originalHasAuthRoles;
        vi.clearAllMocks();
    });

    it('accepts only an empty input object', () => {
        expect(listEnvironmentsTool.inputSchema.safeParse({}).success).toBe(true);
        expect(listEnvironmentsTool.inputSchema.safeParse({ environment: 'dev' }).success).toBe(false);
    });

    it('lists every environment for administrators', async () => {
        const result = await getAuthorizedManagementMcpEnvironments({ user: user('administrator'), account, plan });

        expect(getEnvironmentsMock).toHaveBeenCalledWith(account.id);
        expect(result).toStrictEqual(environments);
    });

    it('applies current RBAC permissions instead of token-carried environment grants', async () => {
        const result = await getAuthorizedManagementMcpEnvironments({ user: user('development_full_access'), account, plan });

        expect(result).toStrictEqual([environments[0]]);
    });

    it('may return no environments', async () => {
        getEnvironmentsMock.mockResolvedValue([]);

        await expect(getAuthorizedManagementMcpEnvironments({ user: user('administrator'), account, plan })).resolves.toStrictEqual([]);
    });
});

function user(role: DBUser['role']): DBUser {
    return { id: 7, account_id: account.id, email: 'user@example.com', role } as DBUser;
}
