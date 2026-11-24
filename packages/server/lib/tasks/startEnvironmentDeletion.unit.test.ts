import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

const order: string[] = [];

const softDelete = vi.fn((..._args: unknown[]) => {
    order.push('softDelete');
    return Promise.resolve(1);
});
vi.mock('@nangohq/shared', () => ({
    environmentService: { softDelete: (...args: unknown[]) => softDelete(...args) }
}));

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

const enqueue = vi.fn((..._args: unknown[]) => {
    order.push('enqueue');
    return Promise.resolve(Ok({ taskId: 't' }));
});
vi.mock('./index.js', () => ({ tasks: { enqueue: (...args: unknown[]) => enqueue(...args) } }));

const { startEnvironmentDeletion } = await import('./startEnvironmentDeletion.js');

describe('startEnvironmentDeletion', () => {
    beforeEach(() => {
        order.length = 0;
        txOutcome = null;
        softDelete.mockReset().mockImplementation(() => {
            order.push('softDelete');
            return Promise.resolve(1);
        });
        enqueue.mockReset().mockImplementation(() => {
            order.push('enqueue');
            return Promise.resolve(Ok({ taskId: 't' }));
        });
    });

    it('soft-deletes the environment then enqueues deleteEnvironment with a short startsAfter delay', async () => {
        const res = await startEnvironmentDeletion({ environmentId: 42 });

        expect(res.isOk()).toBe(true);
        expect(softDelete).toHaveBeenCalledWith({}, { environmentId: 42 });
        expect(enqueue).toHaveBeenCalledWith('deleteEnvironment', { environmentId: 42 }, expect.objectContaining({ startsAfter: expect.any(Date) }));
        expect(order).toEqual(['softDelete', 'enqueue']);
        expect(txOutcome).toBe('committed');
    });

    it('does not enqueue a duplicate task when the environment is already soft-deleted', async () => {
        softDelete.mockResolvedValueOnce(0);

        const res = await startEnvironmentDeletion({ environmentId: 42 });

        expect(res.isOk()).toBe(true);
        expect(enqueue).not.toHaveBeenCalled();
        expect(txOutcome).toBe('committed');
    });

    it('rolls back the soft-delete and returns Err when enqueue fails', async () => {
        enqueue.mockResolvedValueOnce(Err(new Error('queue down')));

        const res = await startEnvironmentDeletion({ environmentId: 42 });

        expect(res.isErr()).toBe(true);
        expect(txOutcome).toBe('rolledback');
    });

    it('returns Err and does not enqueue when soft-delete throws', async () => {
        softDelete.mockRejectedValueOnce(new Error('db down'));

        const res = await startEnvironmentDeletion({ environmentId: 42 });

        expect(res.isErr()).toBe(true);
        expect(enqueue).not.toHaveBeenCalled();
        expect(txOutcome).toBe('rolledback');
    });
});
