import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

const order: string[] = [];
const mockTrx = {};

const acquireDeletionLock = vi.fn((..._args: unknown[]) => {
    order.push('acquireDeletionLock');
    return Promise.resolve();
});
const softDelete = vi.fn((..._args: unknown[]) => {
    order.push('softDelete');
    return Promise.resolve(1);
});
vi.mock('@nangohq/shared', () => ({
    environmentService: {
        acquireDeletionLock: (...args: unknown[]) => acquireDeletionLock(...args),
        softDelete: (...args: unknown[]) => softDelete(...args)
    }
}));

let txOutcome: 'committed' | 'rolledback' | null = null;
const transaction = vi.fn(async (cb: (trx: unknown) => Promise<unknown>) => {
    try {
        const result = await cb(mockTrx);
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
        acquireDeletionLock.mockReset().mockImplementation(() => {
            order.push('acquireDeletionLock');
            return Promise.resolve();
        });
        softDelete.mockReset().mockImplementation(() => {
            order.push('softDelete');
            return Promise.resolve(1);
        });
        enqueue.mockReset().mockImplementation(() => {
            order.push('enqueue');
            return Promise.resolve(Ok({ taskId: 't' }));
        });
    });

    it('acquires the deletion lock, soft-deletes, and enqueues deleteEnvironment inside one transaction', async () => {
        const res = await startEnvironmentDeletion({ environmentId: 42 });

        expect(res.isOk()).toBe(true);
        expect(acquireDeletionLock).toHaveBeenCalledWith(mockTrx, { environmentId: 42 });
        expect(softDelete).toHaveBeenCalledWith(mockTrx, { environmentId: 42 });
        expect(enqueue).toHaveBeenCalledWith('deleteEnvironment', { environmentId: 42 });
        expect(order).toEqual(['acquireDeletionLock', 'softDelete', 'enqueue']);
        expect(txOutcome).toBe('committed');
    });

    it('does not enqueue a duplicate task when the environment is already soft-deleted', async () => {
        softDelete.mockResolvedValueOnce(0);

        const res = await startEnvironmentDeletion({ environmentId: 42 });

        expect(res.isOk()).toBe(true);
        expect(acquireDeletionLock).toHaveBeenCalledWith(mockTrx, { environmentId: 42 });
        expect(enqueue).not.toHaveBeenCalled();
        expect(txOutcome).toBe('committed');
    });

    it('rolls back the soft-delete and returns Err when enqueue fails', async () => {
        enqueue.mockImplementationOnce(() => {
            order.push('enqueue');
            return Promise.resolve(Err(new Error('queue down')));
        });

        const res = await startEnvironmentDeletion({ environmentId: 42 });

        expect(res.isErr()).toBe(true);
        expect(order).toEqual(['acquireDeletionLock', 'softDelete', 'enqueue']);
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
