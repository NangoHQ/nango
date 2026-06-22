import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Ok } from '@nangohq/utils';

import { DeletionBudgetExceeded } from '../../deletion/batchDelete.js';

// The task is a thin wrapper around deleteSyncRecords (mocked here).
const deleteSyncRecords = vi.fn();
vi.mock('../../deletion/deleteSyncRecords.js', () => ({
    deleteSyncRecords: (...args: unknown[]) => deleteSyncRecords(...args)
}));

const enqueue = vi.fn().mockResolvedValue(Ok({ taskId: 't' }));
vi.mock('../index.js', () => ({ tasks: { enqueue } }));

const { deleteRecordsTask } = await import('./deleteRecords.js');

const ctx = { taskId: 't', attempt: 0, logger: { info: vi.fn(), warning: vi.fn() } } as any;
const payload = { syncId: 'sync-a', nangoConnectionId: 5, environmentId: 10, models: ['User'], generation: 6 };

describe('deleteRecords task', () => {
    beforeEach(() => {
        deleteSyncRecords.mockReset().mockResolvedValue(undefined);
        enqueue.mockClear().mockResolvedValue(Ok({ taskId: 't' }));
    });

    it('drains within budget, returns Ok and does not self-chain', async () => {
        const res = await deleteRecordsTask.handle(payload, ctx);

        expect(res.isOk()).toBe(true);
        expect(deleteSyncRecords).toHaveBeenCalledWith(payload, { logger: ctx.logger, deadline: expect.any(Date) });
        expect(enqueue).not.toHaveBeenCalled();
    });

    it('self-chains a continuation (same payload) on DeletionBudgetExceeded', async () => {
        deleteSyncRecords.mockImplementation(() => {
            throw new DeletionBudgetExceeded();
        });

        const res = await deleteRecordsTask.handle(payload, ctx);

        expect(res.isOk()).toBe(true);
        expect(enqueue).toHaveBeenCalledWith('deleteRecords', payload);
    });
});
