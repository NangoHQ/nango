import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

import { getManagementMcpEnvironments, listEnvironmentsTool } from './list.js';

import type { DBTeam } from '@nangohq/types';

const { getEnvironmentsMock, getEnvironmentByNameMock } = vi.hoisted(() => ({
    getEnvironmentsMock: vi.fn(),
    getEnvironmentByNameMock: vi.fn()
}));

vi.mock('@nangohq/shared', () => ({
    environmentService: { getEnvironmentsByAccountId: getEnvironmentsMock, getByEnvironmentName: getEnvironmentByNameMock }
}));

const account = { id: 42 } as DBTeam;
const environments = [
    { id: 1, uuid: 'dev', name: 'dev', is_production: false },
    { id: 2, uuid: 'prod', name: 'prod', is_production: true }
];

describe('environments_list', () => {
    beforeEach(() => {
        getEnvironmentsMock.mockResolvedValue(Ok(environments));
        getEnvironmentByNameMock.mockImplementation((_accountId: number, name: string) =>
            Promise.resolve(environments.find((environment) => environment.name === name) ?? null)
        );
        vi.clearAllMocks();
    });

    it('accepts only an empty input object', () => {
        expect(listEnvironmentsTool.inputSchema.safeParse({}).success).toBe(true);
        expect(listEnvironmentsTool.inputSchema.safeParse({ environment: 'dev' }).success).toBe(false);
    });

    it('lists every environment in the authenticated account', async () => {
        const result = await getManagementMcpEnvironments({ account });

        expect(getEnvironmentsMock).toHaveBeenCalledWith(account.id);
        expect(getEnvironmentByNameMock).toHaveBeenCalledTimes(2);
        expect(getEnvironmentByNameMock).toHaveBeenCalledWith(account.id, 'dev');
        expect(getEnvironmentByNameMock).toHaveBeenCalledWith(account.id, 'prod');
        expect(result).toStrictEqual(environments);
    });

    it('may return no environments', async () => {
        getEnvironmentsMock.mockResolvedValue(Ok([]));

        await expect(getManagementMcpEnvironments({ account })).resolves.toStrictEqual([]);
    });

    it('propagates environment lookup failures', async () => {
        const error = new Error('failed to retrieve environments');
        getEnvironmentsMock.mockResolvedValue(Err(error));

        await expect(getManagementMcpEnvironments({ account })).rejects.toBe(error);
        expect(getEnvironmentByNameMock).not.toHaveBeenCalled();
    });
});
