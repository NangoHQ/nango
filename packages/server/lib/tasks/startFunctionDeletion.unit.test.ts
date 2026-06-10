import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

const order: string[] = [];

const deleteSyncConfig = vi.fn((..._args: unknown[]) => {
    order.push('deleteSyncConfig');
    return Promise.resolve();
});
vi.mock('@nangohq/shared', () => ({
    deleteSyncConfig: (...args: unknown[]) => deleteSyncConfig(...args)
}));

const enqueue = vi.fn(() => {
    order.push('enqueue');
    return Promise.resolve(Ok({ taskId: 't' }));
});
vi.mock('./index.js', () => ({ tasks: { enqueue } }));

const { startFunctionDeletion } = await import('./startFunctionDeletion.js');

describe('startFunctionDeletion', () => {
    beforeEach(() => {
        order.length = 0;
        deleteSyncConfig.mockClear();
        enqueue.mockClear().mockImplementation(() => {
            order.push('enqueue');
            return Promise.resolve(Ok({ taskId: 't' }));
        });
    });

    it('enqueues the teardown task first, then soft-deletes the config (O(1), no per-sync work)', async () => {
        const res = await startFunctionDeletion({ syncConfigId: 1, environmentId: 10, models: ['User'] });

        expect(res.isOk()).toBe(true);
        expect(enqueue).toHaveBeenCalledWith('deleteFunction', { syncConfigId: 1, environmentId: 10, models: ['User'] });
        expect(deleteSyncConfig).toHaveBeenCalledWith(1);
        // Durable-first: the config is only soft-deleted once the teardown task is queued.
        expect(order).toEqual(['enqueue', 'deleteSyncConfig']);
    });

    it('returns Err and does NOT touch the config when the teardown enqueue fails', async () => {
        enqueue.mockResolvedValue(Err(new Error('queue down')));

        const res = await startFunctionDeletion({ syncConfigId: 1, environmentId: 10, models: ['User'] });

        expect(res.isErr()).toBe(true);
        expect(deleteSyncConfig).not.toHaveBeenCalled();
    });
});
