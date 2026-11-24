import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

import { DeletionBudgetExceeded } from '../../deletion/batchDelete.js';

import type { TaskContext } from '@nangohq/tasks';

const enqueue = vi.fn().mockResolvedValue(Ok({ taskId: 'task-id' }));
vi.mock('../index.js', () => ({ tasks: { enqueue } }));

const deleteEnvironmentData = vi.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue(undefined);
vi.mock('../../deletion/deleteEnvironmentData.js', () => ({
    deleteEnvironmentData: (...args: unknown[]) => deleteEnvironmentData(...args)
}));

const acquireDeletionLock = vi.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue(undefined);
vi.mock('@nangohq/shared', () => ({
    environmentService: {
        acquireDeletionLock: (...args: unknown[]) => acquireDeletionLock(...args)
    }
}));

const first = vi.fn();
const where = vi.fn(() => ({ first }));
const trx = vi.fn(() => ({ where }));
const knex = Object.assign(
    vi.fn(() => ({ where })),
    {
        transaction: vi.fn((cb: (t: typeof trx) => Promise<unknown>) => cb(trx))
    }
);
vi.mock('@nangohq/database', () => ({ default: { knex } }));

const { deleteEnvironmentTask } = await import('./deleteEnvironment.js');

const ctx: TaskContext = {
    taskId: 't',
    attempt: 0,
    logger: {
        info: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        warning: vi.fn(),
        warn: vi.fn(),
        critical: vi.fn(),
        log: vi.fn()
    } as unknown as TaskContext['logger']
};
const payload = { environmentId: 42 };

describe('deleteEnvironment task', () => {
    beforeEach(() => {
        acquireDeletionLock.mockReset().mockResolvedValue(undefined);
        enqueue.mockReset().mockResolvedValue(Ok({ taskId: 'task-id' }));
        deleteEnvironmentData.mockReset().mockResolvedValue(undefined);
        first.mockReset().mockResolvedValue({ id: 42, name: 'old-dev', deleted: true });
        where.mockClear();
        trx.mockClear();
        knex.mockClear();
    });
    afterEach(() => vi.clearAllMocks());

    it('drives deleteEnvironmentData under a time budget when the environment is soft-deleted', async () => {
        const res = await deleteEnvironmentTask.handle(payload, ctx);

        expect(res.isOk()).toBe(true);
        expect(acquireDeletionLock).toHaveBeenCalledWith(trx, { environmentId: 42 });
        expect(trx).toHaveBeenCalledWith('_nango_environments');
        expect(where).toHaveBeenCalledWith({ id: 42 });
        expect(deleteEnvironmentData).toHaveBeenCalledTimes(1);
        expect(deleteEnvironmentData).toHaveBeenCalledWith(
            expect.objectContaining({ id: 42, deleted: true }),
            expect.objectContaining({ sleepMs: 0, limit: 100, deadline: expect.any(Date) })
        );
        expect(enqueue).not.toHaveBeenCalled();
    });

    it('no-ops when the environment is already hard-deleted', async () => {
        first.mockResolvedValue(undefined);

        const res = await deleteEnvironmentTask.handle(payload, ctx);

        expect(res.isOk()).toBe(true);
        expect(deleteEnvironmentData).not.toHaveBeenCalled();
        expect(enqueue).not.toHaveBeenCalled();
    });

    it('no-ops when the environment is still live (soft-delete rolled back)', async () => {
        first.mockResolvedValue({ id: 42, name: 'old-dev', deleted: false });

        const res = await deleteEnvironmentTask.handle(payload, ctx);

        expect(res.isOk()).toBe(true);
        expect(deleteEnvironmentData).not.toHaveBeenCalled();
        expect(enqueue).not.toHaveBeenCalled();
    });

    it('self-chains a continuation task on DeletionBudgetExceeded', async () => {
        deleteEnvironmentData.mockRejectedValue(new DeletionBudgetExceeded());

        const res = await deleteEnvironmentTask.handle(payload, ctx);

        expect(res.isOk()).toBe(true);
        expect(enqueue).toHaveBeenCalledExactlyOnceWith('deleteEnvironment', payload);
    });

    it('returns Err when continuation enqueue fails', async () => {
        deleteEnvironmentData.mockRejectedValue(new DeletionBudgetExceeded());
        enqueue.mockResolvedValueOnce(Err(new Error('enqueue down')));

        const res = await deleteEnvironmentTask.handle(payload, ctx);

        expect(res.isErr()).toBe(true);
    });

    it('returns Err on a non-budget error without chaining', async () => {
        deleteEnvironmentData.mockRejectedValue(new Error('db failure'));

        const res = await deleteEnvironmentTask.handle(payload, ctx);

        expect(res.isErr()).toBe(true);
        expect(enqueue).not.toHaveBeenCalled();
    });
});
