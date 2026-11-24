import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

import type * as NangoUtils from '@nangohq/utils';

const order: string[] = [];
const mockKnex = {};

const softDelete = vi.fn((..._args: unknown[]) => {
    order.push('softDelete');
    return Promise.resolve(1);
});
const restoreSoftDeleted = vi.fn((..._args: unknown[]) => {
    order.push('restoreSoftDeleted');
    return Promise.resolve(1);
});
vi.mock('@nangohq/shared', () => ({
    environmentService: {
        softDelete: (...args: unknown[]) => softDelete(...args),
        restoreSoftDeleted: (...args: unknown[]) => restoreSoftDeleted(...args)
    }
}));

vi.mock('@nangohq/database', () => ({ default: { knex: mockKnex } }));

const report = vi.fn();
vi.mock('@nangohq/utils', async (importOriginal) => {
    const actual = await importOriginal<typeof NangoUtils>();
    return {
        ...actual,
        report: (...args: unknown[]): void => {
            report(...args);
        }
    };
});

const enqueue = vi.fn((..._args: unknown[]) => {
    order.push('enqueue');
    return Promise.resolve(Ok({ taskId: 't' }));
});
vi.mock('./index.js', () => ({ tasks: { enqueue: (...args: unknown[]) => enqueue(...args) } }));

const { startEnvironmentDeletion } = await import('./startEnvironmentDeletion.js');

describe('startEnvironmentDeletion', () => {
    beforeEach(() => {
        order.length = 0;
        report.mockReset();
        softDelete.mockReset().mockImplementation(() => {
            order.push('softDelete');
            return Promise.resolve(1);
        });
        restoreSoftDeleted.mockReset().mockImplementation(() => {
            order.push('restoreSoftDeleted');
            return Promise.resolve(1);
        });
        enqueue.mockReset().mockImplementation(() => {
            order.push('enqueue');
            return Promise.resolve(Ok({ taskId: 't' }));
        });
    });

    it('commits the soft-delete before enqueuing deleteEnvironment', async () => {
        const res = await startEnvironmentDeletion({ environmentId: 42 });

        expect(res.isOk()).toBe(true);
        expect(softDelete).toHaveBeenCalledWith(mockKnex, { environmentId: 42 });
        expect(enqueue).toHaveBeenCalledWith('deleteEnvironment', { environmentId: 42 });
        expect(restoreSoftDeleted).not.toHaveBeenCalled();
        expect(order).toEqual(['softDelete', 'enqueue']);
    });

    it('does not enqueue a duplicate task when the environment is already soft-deleted', async () => {
        softDelete.mockResolvedValueOnce(0);

        const res = await startEnvironmentDeletion({ environmentId: 42 });

        expect(res.isOk()).toBe(true);
        expect(enqueue).not.toHaveBeenCalled();
        expect(restoreSoftDeleted).not.toHaveBeenCalled();
    });

    it('restores the soft-deleted environment and returns Err when enqueue fails', async () => {
        enqueue.mockResolvedValueOnce(Err(new Error('queue down')));

        const res = await startEnvironmentDeletion({ environmentId: 42 });

        expect(res.isErr()).toBe(true);
        expect(restoreSoftDeleted).toHaveBeenCalledWith(mockKnex, { environmentId: 42 });
        expect(order).toEqual(['softDelete', 'restoreSoftDeleted']);
    });

    it('preserves the original enqueue error and reports when restoreSoftDeleted also fails', async () => {
        const enqueueErr = new Error('queue down');
        const restoreErr = new Error('restore failed');
        enqueue.mockResolvedValueOnce(Err(enqueueErr));
        restoreSoftDeleted.mockRejectedValueOnce(restoreErr);

        const res = await startEnvironmentDeletion({ environmentId: 42 });

        expect(res.isErr()).toBe(true);
        if (res.isErr()) {
            expect(res.error).toBe(enqueueErr);
        }
        expect(report).toHaveBeenCalledWith(restoreErr, { environmentId: 42 });
    });

    it('returns Err and does not enqueue or restore when soft-delete throws', async () => {
        softDelete.mockRejectedValueOnce(new Error('db down'));

        const res = await startEnvironmentDeletion({ environmentId: 42 });

        expect(res.isErr()).toBe(true);
        expect(enqueue).not.toHaveBeenCalled();
        expect(restoreSoftDeleted).not.toHaveBeenCalled();
    });
});
