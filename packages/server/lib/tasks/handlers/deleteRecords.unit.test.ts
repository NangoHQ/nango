import { beforeEach, describe, expect, it, vi } from 'vitest';

// deleteSyncRecords does the deletion + billing emission; the task is just a wrapper, so we mock it.
// The failure path (rejection -> Err) is a trivial try/catch and is covered where it matters:
// deleteSyncRecords.unit.test.ts (the real throwing logic) and deleteFunction.unit.test.ts (the same wrapper shape).
const deleteSyncRecords = vi.fn();
vi.mock('../../crons/delete/deleteSyncRecords.js', () => ({
    deleteSyncRecords: (...args: unknown[]) => deleteSyncRecords(...args)
}));

const { deleteRecordsTask } = await import('./deleteRecords.js');

const ctx = { taskId: 't', attempt: 0, logger: { info: vi.fn(), warning: vi.fn() } } as any;
const payload = { syncId: 'sync-a', nangoConnectionId: 5, environmentId: 10, models: ['User'], generation: 6 };

describe('deleteRecords task', () => {
    beforeEach(() => deleteSyncRecords.mockReset().mockResolvedValue(undefined));

    it('delegates to deleteSyncRecords and returns Ok', async () => {
        const res = await deleteRecordsTask.handle(payload, ctx);

        expect(res.isOk()).toBe(true);
        expect(deleteSyncRecords).toHaveBeenCalledWith(payload, { logger: ctx.logger });
    });
});
