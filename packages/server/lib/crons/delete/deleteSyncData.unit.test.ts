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

const deleteSync = vi.fn(() => {
    order.push('unschedule');
    return Promise.resolve(Ok(undefined));
});
vi.mock('../../utils/utils.js', () => ({ getOrchestrator: () => ({ deleteSync }) }));

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

const { deleteSyncData } = await import('./deleteSyncData.js');

const opts = { deadline: new Date(Date.now() + 60_000), limit: 1000, logger: { info: vi.fn() } as any, sleepMs: 0 };

describe('deleteSyncData', () => {
    beforeEach(() => {
        order.length = 0;
        enqueue.mockClear();
        deleteSync.mockClear();
        hardDeleteSync.mockClear();
        getLatestSyncJob.mockReset().mockResolvedValue({ id: 5 });
    });
    afterEach(() => vi.clearAllMocks());

    it('unschedules, then dispatches deleteRecords (generation = lastJobId + 1) BEFORE hard-deleting the sync', async () => {
        await deleteSyncData({ syncId: 's1', nangoConnectionId: 5, environmentId: 10, models: ['User'] }, opts);

        expect(deleteSync).toHaveBeenCalledWith({ syncId: 's1', environmentId: 10 });
        expect(enqueue).toHaveBeenCalledWith('deleteRecords', { syncId: 's1', nangoConnectionId: 5, environmentId: 10, models: ['User'], generation: 6 });
        expect(hardDeleteSync).toHaveBeenCalledWith('s1');
        expect(order).toEqual(['unschedule', 'enqueue:deleteRecords', 'hardDeleteSync']);
    });

    it('does not dispatch deleteRecords when the sync never ran (no job)', async () => {
        getLatestSyncJob.mockResolvedValue(null);

        await deleteSyncData({ syncId: 's1', nangoConnectionId: 5, environmentId: 10, models: ['User'] }, opts);

        expect(enqueue).not.toHaveBeenCalled();
        expect(hardDeleteSync).toHaveBeenCalledWith('s1');
    });

    it('skips unschedule when environmentId is null and skips records when there are no models', async () => {
        await deleteSyncData({ syncId: 's1', nangoConnectionId: 5, environmentId: null, models: [] }, opts);

        expect(deleteSync).not.toHaveBeenCalled();
        expect(enqueue).not.toHaveBeenCalled();
        expect(hardDeleteSync).toHaveBeenCalledWith('s1');
    });
});
