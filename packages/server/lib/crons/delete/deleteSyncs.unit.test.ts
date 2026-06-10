import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Ok } from '@nangohq/utils';

const order: string[] = [];

// batchDelete is a no-op; we assert the ordering of unschedule / enqueue / hardDeleteSync.
vi.mock('./batchDelete.js', () => ({ batchDelete: vi.fn().mockResolvedValue(undefined) }));

const enqueue = vi.fn(() => {
    order.push('enqueue:deleteRecords');
    return Promise.resolve(Ok({ taskId: 't' }));
});
vi.mock('../../tasks/index.js', () => ({ tasks: { enqueue } }));

const deleteSyncsClient = vi.fn((..._args: unknown[]) => {
    order.push('unschedule');
    return Promise.resolve(Ok(undefined));
});
vi.mock('../../utils/utils.js', () => ({ getOrchestrator: () => ({ deleteSyncs: (...args: unknown[]) => deleteSyncsClient(...args) }) }));

const getLatestSyncJob = vi.fn();
const hardDeleteSync = vi.fn((..._args: unknown[]) => {
    order.push('hardDeleteSync');
    return Promise.resolve();
});
vi.mock('@nangohq/shared', () => ({
    getLatestSyncJob: (...args: unknown[]) => getLatestSyncJob(...args),
    hardDeleteJobs: vi.fn().mockResolvedValue(0),
    hardDeleteSync: (...args: unknown[]) => hardDeleteSync(...args)
}));
vi.mock('@nangohq/database', () => ({ default: { knex: {} } }));

const { deleteSyncs } = await import('./deleteSyncs.js');

const opts = { deadline: new Date(Date.now() + 60_000), limit: 1000, logger: { info: vi.fn() } as any, sleepMs: 0 };

describe('deleteSyncs', () => {
    beforeEach(() => {
        order.length = 0;
        enqueue.mockClear();
        deleteSyncsClient.mockClear().mockImplementation((..._args: unknown[]) => {
            order.push('unschedule');
            return Promise.resolve(Ok(undefined));
        });
        hardDeleteSync.mockClear();
        getLatestSyncJob.mockReset().mockResolvedValue({ id: 5 });
    });
    afterEach(() => vi.clearAllMocks());

    it('bulk-unschedules the whole batch BEFORE tearing down any sync, then deletes records + the sync row', async () => {
        await deleteSyncs(
            [
                { id: 's1', nangoConnectionId: 5, environmentId: 10, models: ['User'] },
                { id: 's2', nangoConnectionId: 6, environmentId: 10, models: ['User'] }
            ],
            opts
        );

        // One bulk-unschedule for the batch (not one call per sync).
        expect(deleteSyncsClient).toHaveBeenCalledTimes(1);
        expect(deleteSyncsClient).toHaveBeenCalledWith({ syncIds: ['s1', 's2'], environmentId: 10 });
        expect(enqueue).toHaveBeenCalledWith('deleteRecords', { syncId: 's1', nangoConnectionId: 5, environmentId: 10, models: ['User'], generation: 6 });
        // Unschedule precedes all teardown; records dispatched before each sync row is hard-deleted.
        expect(order).toEqual(['unschedule', 'enqueue:deleteRecords', 'hardDeleteSync', 'enqueue:deleteRecords', 'hardDeleteSync']);
    });

    it('groups the bulk-unschedule by environment (one call per env)', async () => {
        await deleteSyncs(
            [
                { id: 's1', nangoConnectionId: 5, environmentId: 10, models: ['User'] },
                { id: 's2', nangoConnectionId: 6, environmentId: 20, models: ['User'] },
                { id: 's3', nangoConnectionId: 7, environmentId: 10, models: ['User'] }
            ],
            opts
        );

        expect(deleteSyncsClient).toHaveBeenCalledTimes(2);
        expect(deleteSyncsClient).toHaveBeenCalledWith({ syncIds: ['s1', 's3'], environmentId: 10 });
        expect(deleteSyncsClient).toHaveBeenCalledWith({ syncIds: ['s2'], environmentId: 20 });
    });

    it('is a no-op for an empty batch (never calls the orchestrator)', async () => {
        await deleteSyncs([], opts);

        expect(deleteSyncsClient).not.toHaveBeenCalled();
        expect(hardDeleteSync).not.toHaveBeenCalled();
    });

    it('skips unschedule and records for a null-environment sync but still hard-deletes it', async () => {
        await deleteSyncs([{ id: 's1', nangoConnectionId: 5, environmentId: null, models: ['User'] }], opts);

        expect(deleteSyncsClient).not.toHaveBeenCalled();
        expect(enqueue).not.toHaveBeenCalled();
        expect(hardDeleteSync).toHaveBeenCalledWith('s1');
    });

    it('does not dispatch deleteRecords for a sync that never ran (no job)', async () => {
        getLatestSyncJob.mockResolvedValue(null);

        await deleteSyncs([{ id: 's1', nangoConnectionId: 5, environmentId: 10, models: ['User'] }], opts);

        expect(enqueue).not.toHaveBeenCalled();
        expect(hardDeleteSync).toHaveBeenCalledWith('s1');
    });
});
