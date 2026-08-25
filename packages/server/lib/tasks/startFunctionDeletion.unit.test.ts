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

// Emulate knex: run the callback (committing on resolve, rolling back on throw) and record the outcome.
let txOutcome: 'committed' | 'rolledback' | null = null;
const transaction = vi.fn(async (cb: (trx: unknown) => Promise<unknown>) => {
    try {
        const result = await cb({});
        txOutcome = 'committed';
        return result;
    } catch (err) {
        txOutcome = 'rolledback';
        throw err;
    }
});
vi.mock('@nangohq/database', () => ({ default: { knex: { transaction: (cb: (trx: unknown) => Promise<unknown>) => transaction(cb) } } }));

const enqueue = vi.fn(() => {
    order.push('enqueue');
    return Promise.resolve(Ok({ taskId: 't' }));
});
vi.mock('./index.js', () => ({ tasks: { enqueue } }));

const { startFunctionDeletion } = await import('./startFunctionDeletion.js');

describe('startFunctionDeletion', () => {
    beforeEach(() => {
        order.length = 0;
        txOutcome = null;
        deleteSyncConfig.mockClear().mockImplementation(() => {
            order.push('deleteSyncConfig');
            return Promise.resolve();
        });
        enqueue.mockClear().mockImplementation(() => {
            order.push('enqueue');
            return Promise.resolve(Ok({ taskId: 't' }));
        });
    });

    it('soft-deletes the config then enqueues the teardown, committing the transaction', async () => {
        const res = await startFunctionDeletion({ syncConfigId: 1, environmentId: 10, models: ['User'] });

        expect(res.isOk()).toBe(true);
        expect(deleteSyncConfig).toHaveBeenCalledWith(1, expect.anything());
        expect(enqueue).toHaveBeenCalledWith('deleteFunction', { syncConfigId: 1, environmentId: 10, models: ['User'] });
        // Soft-delete is enqueue-gated and runs in the transaction: mark deleted, then enqueue, then commit.
        expect(order).toEqual(['deleteSyncConfig', 'enqueue']);
        expect(txOutcome).toBe('committed');
    });

    it('rolls back the soft-delete and returns Err when the enqueue fails', async () => {
        enqueue.mockImplementation(() => {
            order.push('enqueue');
            return Promise.resolve(Err(new Error('queue down')));
        });

        const res = await startFunctionDeletion({ syncConfigId: 1, environmentId: 10, models: ['User'] });

        expect(res.isErr()).toBe(true);
        // The soft-delete was attempted but the failed enqueue throws → the transaction rolls it back.
        expect(deleteSyncConfig).toHaveBeenCalled();
        expect(txOutcome).toBe('rolledback');
    });

    it('returns Err and does NOT enqueue when the soft-delete fails', async () => {
        deleteSyncConfig.mockRejectedValueOnce(new Error('db down'));

        const res = await startFunctionDeletion({ syncConfigId: 1, environmentId: 10, models: ['User'] });

        expect(res.isErr()).toBe(true);
        expect(enqueue).not.toHaveBeenCalled();
        expect(txOutcome).toBe('rolledback');
    });
});
