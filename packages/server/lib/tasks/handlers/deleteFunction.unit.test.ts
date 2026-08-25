import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Ok } from '@nangohq/utils';

import { DeletionBudgetExceeded } from '../../deletion/batchDelete.js';

// Mock the task-queue singleton (assert enqueues) and the tree node (covered by the deletion-tree tests).
const enqueue = vi.fn().mockResolvedValue(Ok({ taskId: 'task-id' }));
vi.mock('../index.js', () => ({ tasks: { enqueue } }));

const deleteSyncConfigData = vi.fn().mockResolvedValue(undefined);
vi.mock('../../deletion/deleteSyncConfigData.js', () => ({
    deleteSyncConfigData: (...args: unknown[]) => deleteSyncConfigData(...args)
}));

// null = config is soft-deleted (getSyncConfigById only returns live rows), the normal teardown precondition.
const getSyncConfigById = vi.fn().mockResolvedValue(null);
vi.mock('@nangohq/shared', () => ({
    getSyncConfigById: (...args: unknown[]) => getSyncConfigById(...args)
}));

const { deleteFunctionTask } = await import('./deleteFunction.js');

const ctx = { taskId: 't', attempt: 0, logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warning: vi.fn() } } as any;
const payload = { syncConfigId: 1, environmentId: 10, models: ['User'] };

const run = () => deleteFunctionTask.handle(payload, ctx);
const enqueuesOfType = (type: string) => enqueue.mock.calls.filter((c) => c[0] === type);

describe('deleteFunction task', () => {
    beforeEach(() => {
        enqueue.mockClear().mockResolvedValue(Ok({ taskId: 'task-id' }));
        deleteSyncConfigData.mockReset().mockResolvedValue(undefined);
        getSyncConfigById.mockReset().mockResolvedValue(null);
    });
    afterEach(() => vi.clearAllMocks());

    it('no-ops when the config is still live (soft-delete rolled back after enqueue committed)', async () => {
        getSyncConfigById.mockResolvedValue({ id: 1, deleted: false });

        const res = await run();

        expect(res.isOk()).toBe(true);
        expect(deleteSyncConfigData).not.toHaveBeenCalled();
        expect(enqueuesOfType('deleteFunction')).toHaveLength(0);
    });

    it('drives deleteSyncConfigData (with a budget) and returns Ok with no continuation', async () => {
        const res = await run();

        expect(res.isOk()).toBe(true);
        expect(deleteSyncConfigData).toHaveBeenCalledTimes(1);
        expect(deleteSyncConfigData.mock.calls[0]![0]).toEqual({ syncConfigId: 1, environmentId: 10, models: ['User'] });
        // Driven under a per-task budget (deadline in the future, no inter-batch sleep).
        const opts = deleteSyncConfigData.mock.calls[0]![1];
        expect(opts.sleepMs).toBe(0);
        expect(opts.deadline.getTime()).toBeGreaterThan(Date.now());
        expect(enqueuesOfType('deleteFunction')).toHaveLength(0);
    });

    it('self-chains exactly one continuation (same payload) on DeletionBudgetExceeded', async () => {
        deleteSyncConfigData.mockRejectedValue(new DeletionBudgetExceeded());

        const res = await run();

        expect(res.isOk()).toBe(true);
        const chained = enqueuesOfType('deleteFunction');
        expect(chained).toHaveLength(1);
        expect(chained[0]![1]).toEqual(payload);
    });

    it('returns Err on a non-budget error', async () => {
        deleteSyncConfigData.mockRejectedValue(new Error('boom'));

        const res = await run();

        expect(res.isErr()).toBe(true);
        expect(enqueuesOfType('deleteFunction')).toHaveLength(0);
    });

    it('returns Err when the continuation enqueue fails', async () => {
        deleteSyncConfigData.mockRejectedValue(new DeletionBudgetExceeded());
        enqueue.mockResolvedValueOnce({ isErr: () => true, error: new Error('enqueue down') } as any);

        const res = await run();

        expect(res.isErr()).toBe(true);
    });
});
