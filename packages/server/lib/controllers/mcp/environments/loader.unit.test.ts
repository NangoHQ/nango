import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

import { createManagementMcpEnvironmentLoader } from './loader.js';

const { getEnvironmentsMock } = vi.hoisted(() => ({ getEnvironmentsMock: vi.fn() }));

vi.mock('@nangohq/shared', () => ({
    environmentService: { getEnvironmentsByAccountId: getEnvironmentsMock }
}));

const environmentSummaries = [
    { id: 1, uuid: 'dev', name: 'dev', is_production: false },
    { id: 2, uuid: 'prod', name: 'prod', is_production: true }
];

describe('createManagementMcpEnvironmentLoader', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getEnvironmentsMock.mockResolvedValue(Ok(environmentSummaries));
    });

    it('loads and memoizes environment summaries for the account', async () => {
        const loadEnvironments = createManagementMcpEnvironmentLoader(42);

        const [first, second] = await Promise.all([loadEnvironments(), loadEnvironments()]);

        expect(getEnvironmentsMock).toHaveBeenCalledOnce();
        expect(getEnvironmentsMock).toHaveBeenCalledWith(42);
        expect(first).toStrictEqual(environmentSummaries.map((environment) => ({ ...environment, account_id: 42 })));
        expect(second).toBe(first);
    });

    it('may return no environments', async () => {
        getEnvironmentsMock.mockResolvedValue(Ok([]));

        await expect(createManagementMcpEnvironmentLoader(42)()).resolves.toStrictEqual([]);
    });

    it('evicts failures so a later call can retry', async () => {
        const error = new Error('failed to retrieve environments');
        getEnvironmentsMock.mockResolvedValueOnce(Err(error)).mockResolvedValueOnce(Ok(environmentSummaries));
        const loadEnvironments = createManagementMcpEnvironmentLoader(42);

        await expect(loadEnvironments()).rejects.toBe(error);
        await expect(loadEnvironments()).resolves.toStrictEqual(environmentSummaries.map((environment) => ({ ...environment, account_id: 42 })));
        expect(getEnvironmentsMock).toHaveBeenCalledTimes(2);
    });
});
