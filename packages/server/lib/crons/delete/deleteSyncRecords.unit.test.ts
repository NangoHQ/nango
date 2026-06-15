import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

import { DeletionBudgetExceeded } from './batchDelete.js';

vi.mock('@nangohq/database', () => ({ default: { knex: {} } }));

const deleteOutdatedRecords = vi.fn();
vi.mock('@nangohq/records', () => ({ records: { deleteOutdatedRecords: (...args: unknown[]) => deleteOutdatedRecords(...args) } }));

const publish = vi.fn();
const getConnectionById = vi.fn();
const getById = vi.fn();
const getPlanSafe = vi.fn();
vi.mock('@nangohq/shared', () => ({
    pubsub: { publisher: { publish: (...args: unknown[]) => publish(...args) } },
    connectionService: { getConnectionById: (...args: unknown[]) => getConnectionById(...args) },
    environmentService: { getById: (...args: unknown[]) => getById(...args) },
    getPlanSafe: (...args: unknown[]) => getPlanSafe(...args)
}));

const { deleteSyncRecords } = await import('./deleteSyncRecords.js');

const logger = { info: vi.fn(), warning: vi.fn() } as any;
const input = { syncId: 'sync-a', nangoConnectionId: 5, environmentId: 10, models: ['User', 'Issue'], generation: 6 };

describe('deleteSyncRecords', () => {
    beforeEach(() => {
        deleteOutdatedRecords.mockReset();
        publish.mockClear();
        getConnectionById.mockReset().mockResolvedValue({ connection_id: 'conn-ext', provider_config_key: 'github' });
        getById.mockReset().mockResolvedValue({ account_id: 42, name: 'dev' });
        getPlanSafe.mockReset().mockResolvedValue({ id: 'plan-1' });
    });
    afterEach(() => vi.clearAllMocks());

    it('deletes per model via the generation and publishes a usage.records decrement with the resolved context', async () => {
        deleteOutdatedRecords.mockResolvedValueOnce(Ok(['a', 'b', 'c'])).mockResolvedValueOnce(Ok([]));

        await deleteSyncRecords(input, { logger });

        expect(deleteOutdatedRecords).toHaveBeenCalledWith({ environmentId: 10, connectionId: 5, model: 'User', generation: 6, plan: { id: 'plan-1' } });
        expect(deleteOutdatedRecords).toHaveBeenCalledWith({ environmentId: 10, connectionId: 5, model: 'Issue', generation: 6, plan: { id: 'plan-1' } });
        // Only the model with deletions emits (Issue deleted 0).
        expect(publish).toHaveBeenCalledTimes(1);
        expect(publish).toHaveBeenCalledWith({
            subject: 'usage',
            type: 'usage.records',
            payload: {
                value: -3,
                properties: {
                    accountId: 42,
                    environmentId: 10,
                    environmentName: 'dev',
                    integrationId: 'github',
                    connectionId: 'conn-ext',
                    syncId: 'sync-a',
                    model: 'User'
                }
            }
        });
    });

    it('still deletes but skips emission when the connection/environment cannot be resolved', async () => {
        getConnectionById.mockResolvedValue(null);
        deleteOutdatedRecords.mockResolvedValue(Ok(['a', 'b']));

        await deleteSyncRecords({ ...input, models: ['User'] }, { logger });

        expect(deleteOutdatedRecords).toHaveBeenCalled();
        expect(publish).not.toHaveBeenCalled();
    });

    it('throws if a model deletion errors', async () => {
        deleteOutdatedRecords.mockResolvedValue(Err(new Error('records db down')));

        await expect(deleteSyncRecords({ ...input, models: ['User'] }, { logger })).rejects.toThrow('records db down');
    });

    it('completes without throwing when every model is processed', async () => {
        deleteOutdatedRecords.mockResolvedValue(Ok([]));

        await expect(deleteSyncRecords(input, { logger })).resolves.toBeUndefined();
    });

    it('throws DeletionBudgetExceeded between models once the deadline has passed', async () => {
        await expect(deleteSyncRecords(input, { logger, deadline: new Date(Date.now() - 1) })).rejects.toBeInstanceOf(DeletionBudgetExceeded);
        // Budget is checked before each model, so no model is drained on this run.
        expect(deleteOutdatedRecords).not.toHaveBeenCalled();
    });
});
