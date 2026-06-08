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
vi.mock('./index.js', () => ({ tasks: { enqueue } }));

vi.mock('../utils/utils.js', () => ({ getOrchestrator: () => ({}) }));

const { startFunctionDeletion } = await import('./startFunctionDeletion.js');

describe('startFunctionDeletion', () => {
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

    it('enqueues the teardown task first, then unschedules + soft-deletes every sync and the config', async () => {
        const res = await startFunctionDeletion({ syncConfigId: 1, environmentId: 10, models: ['User'] });

        expect(res.isOk()).toBe(true);
        expect(softDeleteSync).toHaveBeenCalledTimes(2);
        expect(softDeleteSync).toHaveBeenNthCalledWith(1, 's1', 10, expect.anything());
        expect(softDeleteSync).toHaveBeenNthCalledWith(2, 's2', 10, expect.anything());
        expect(enqueue).toHaveBeenCalledWith('deleteFunction', { syncConfigId: 1, environmentId: 10, models: ['User'] });
        // Enqueue is durable-first; the soft-deletes only run once teardown is scheduled.
        expect(order).toEqual(['enqueue', 'softDeleteSync', 'softDeleteSync', 'deleteSyncConfig']);
    });

    it('handles an action (no syncs) — enqueues then soft-deletes the config', async () => {
        getSyncsBySyncConfigId.mockResolvedValue([]);

        const res = await startFunctionDeletion({ syncConfigId: 2, environmentId: 10, models: [] });

        expect(res.isOk()).toBe(true);
        expect(softDeleteSync).not.toHaveBeenCalled();
        expect(order).toEqual(['enqueue', 'deleteSyncConfig']);
    });

    it('returns Err and does NOT soft-delete anything when the teardown enqueue fails', async () => {
        enqueue.mockResolvedValue(Err(new Error('queue down')));

        const res = await startFunctionDeletion({ syncConfigId: 1, environmentId: 10, models: ['User'] });

        expect(res.isErr()).toBe(true);
        expect(softDeleteSync).not.toHaveBeenCalled();
        expect(deleteSyncConfig).not.toHaveBeenCalled();
    });
});
