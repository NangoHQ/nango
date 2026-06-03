import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

const order: string[] = [];

const getSyncsBySyncConfigId = vi.fn();
const softDeleteSync = vi.fn((..._args: unknown[]) => {
    order.push('softDeleteSync');
    return Promise.resolve();
});
const deleteSyncConfig = vi.fn((..._args: unknown[]) => {
    order.push('deleteSyncConfig');
    return Promise.resolve();
});
vi.mock('@nangohq/shared', () => ({
    getSyncsBySyncConfigId: (...args: unknown[]) => getSyncsBySyncConfigId(...args),
    syncManager: { softDeleteSync: (...args: unknown[]) => softDeleteSync(...args) },
    deleteSyncConfig: (...args: unknown[]) => deleteSyncConfig(...args)
}));

const enqueue = vi.fn(() => {
    order.push('enqueue');
    return Promise.resolve(Ok({ taskId: 't' }));
});
vi.mock('./index.js', () => ({ taskQueue: { enqueue } }));

vi.mock('../utils/utils.js', () => ({ getOrchestrator: () => ({}) }));

const { deleteFunction } = await import('./deleteFunction.js');

describe('deleteFunction', () => {
    beforeEach(() => {
        order.length = 0;
        softDeleteSync.mockClear();
        deleteSyncConfig.mockClear();
        enqueue.mockClear().mockImplementation(() => {
            order.push('enqueue');
            return Promise.resolve(Ok({ taskId: 't' }));
        });
        getSyncsBySyncConfigId.mockReset().mockResolvedValue([{ id: 's1' }, { id: 's2' }]);
    });

    it('unschedules + soft-deletes every sync, then soft-deletes the config, then enqueues the teardown task', async () => {
        const res = await deleteFunction({ syncConfigId: 1, environmentId: 10, models: ['User'] });

        expect(res.isOk()).toBe(true);
        expect(softDeleteSync).toHaveBeenCalledTimes(2);
        expect(softDeleteSync).toHaveBeenNthCalledWith(1, 's1', 10, expect.anything());
        expect(softDeleteSync).toHaveBeenNthCalledWith(2, 's2', 10, expect.anything());
        expect(enqueue).toHaveBeenCalledWith('teardownFunction', { syncConfigId: 1, environmentId: 10, models: ['User'] });
        // Syncs stop executing BEFORE the config disappears, and the task is enqueued last.
        expect(order).toEqual(['softDeleteSync', 'softDeleteSync', 'deleteSyncConfig', 'enqueue']);
    });

    it('handles an action (no syncs) — just soft-deletes the config and enqueues', async () => {
        getSyncsBySyncConfigId.mockResolvedValue([]);

        const res = await deleteFunction({ syncConfigId: 2, environmentId: 10, models: [] });

        expect(res.isOk()).toBe(true);
        expect(softDeleteSync).not.toHaveBeenCalled();
        expect(order).toEqual(['deleteSyncConfig', 'enqueue']);
    });

    it('returns Err when the teardown enqueue fails (rows already soft-deleted)', async () => {
        enqueue.mockResolvedValue(Err(new Error('queue down')));

        const res = await deleteFunction({ syncConfigId: 1, environmentId: 10, models: ['User'] });

        expect(res.isErr()).toBe(true);
        expect(deleteSyncConfig).toHaveBeenCalled();
    });
});
