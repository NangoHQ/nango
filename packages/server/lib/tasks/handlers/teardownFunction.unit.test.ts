import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Ok } from '@nangohq/utils';

import { DeletionBudgetExceeded } from '../../crons/delete/batchDelete.js';

// Mock the task-queue singleton (assert enqueues) and the shared tree node (the node's own behavior
// — unschedule + dispatch records/artifacts — is covered by the deletion-tree tests).
const enqueue = vi.fn().mockResolvedValue(Ok({ taskId: 'task-id' }));
vi.mock('../index.js', () => ({ taskQueue: { enqueue } }));

const deleteSyncConfigData = vi.fn().mockResolvedValue(undefined);
vi.mock('../../crons/delete/deleteSyncConfigData.js', () => ({
    deleteSyncConfigData: (...args: unknown[]) => deleteSyncConfigData(...args)
}));

const { teardownFunctionTask } = await import('./teardownFunction.js');

const ctx = { taskId: 't', attempt: 0, logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warning: vi.fn() } } as any;
const payload = { syncConfigId: 1, environmentId: 10, models: ['User'] };

const run = () => teardownFunctionTask.handle(payload, ctx);
const enqueuesOfType = (type: string) => enqueue.mock.calls.filter((c) => c[0] === type);

describe('teardownFunction task', () => {
    beforeEach(() => {
        enqueue.mockClear().mockResolvedValue(Ok({ taskId: 'task-id' }));
        deleteSyncConfigData.mockReset().mockResolvedValue(undefined);
    });
    afterEach(() => vi.clearAllMocks());

    it('drives deleteSyncConfigData (with a budget) and returns Ok with no continuation', async () => {
        const res = await run();

        expect(res.isOk()).toBe(true);
        expect(deleteSyncConfigData).toHaveBeenCalledTimes(1);
        expect(deleteSyncConfigData.mock.calls[0]![0]).toEqual({ syncConfigId: 1, environmentId: 10, models: ['User'] });
        // Driven under a per-task budget (deadline in the future, no inter-batch sleep).
        const opts = deleteSyncConfigData.mock.calls[0]![1];
        expect(opts.sleepMs).toBe(0);
        expect(opts.deadline.getTime()).toBeGreaterThan(Date.now());
        expect(enqueuesOfType('teardownFunction')).toHaveLength(0);
    });

    it('self-chains exactly one continuation (same payload) on DeletionBudgetExceeded', async () => {
        deleteSyncConfigData.mockRejectedValue(new DeletionBudgetExceeded());

        const res = await run();

        expect(res.isOk()).toBe(true);
        const chained = enqueuesOfType('teardownFunction');
        expect(chained).toHaveLength(1);
        expect(chained[0]![1]).toEqual(payload);
    });

    it('returns Err on a non-budget error', async () => {
        deleteSyncConfigData.mockRejectedValue(new Error('boom'));

        const res = await run();

        expect(res.isErr()).toBe(true);
        expect(enqueuesOfType('teardownFunction')).toHaveLength(0);
    });

    it('returns Err when the continuation enqueue fails', async () => {
        deleteSyncConfigData.mockRejectedValue(new DeletionBudgetExceeded());
        enqueue.mockResolvedValueOnce({ isErr: () => true, error: new Error('enqueue down') } as any);

        const res = await run();

        expect(res.isErr()).toBe(true);
    });
});
