import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

const order: string[] = [];
const search = vi.fn();
const hardDelete = vi.fn();
vi.mock('@nangohq/shared', () => ({
    functionInstanceService: {
        search: (...args: unknown[]) => search(...args),
        hardDelete: (...args: unknown[]) => hardDelete(...args)
    }
}));
vi.mock('@nangohq/database', () => ({ default: { knex: 'db' } }));

const deleteFunctionSchedules = vi.fn();
vi.mock('../utils/utils.js', () => ({
    getOrchestrator: () => ({ deleteFunctionSchedules: (...args: unknown[]) => deleteFunctionSchedules(...args) })
}));

const { deleteFunctionInstancesData } = await import('./deleteFunctionInstancesData.js');
const opts = { deadline: new Date(Date.now() + 60_000), limit: 1000, logger: { info: vi.fn() } as any, sleepMs: 0 };

describe(deleteFunctionInstancesData, () => {
    beforeEach(() => {
        order.length = 0;
        search
            .mockReset()
            .mockResolvedValueOnce(Ok([{ id: 1 }, { id: 2 }]))
            .mockResolvedValueOnce(Ok([]));
        deleteFunctionSchedules.mockReset().mockImplementation(() => {
            order.push('delete schedules');
            return Promise.resolve(Ok(undefined));
        });
        hardDelete.mockReset().mockImplementation(() => {
            order.push('hard delete instances');
            return Promise.resolve(Ok([{ id: 1 }, { id: 2 }]));
        });
    });

    it('deletes schedules before hard-deleting active and soft-deleted instances', async () => {
        await deleteFunctionInstancesData({ environmentId: 10, filter: { connectionIds: [20] } }, opts);

        expect(search).toHaveBeenCalledWith('db', { connectionIds: [20] }, { includeDeleted: true, limit: 1000 });
        expect(deleteFunctionSchedules).toHaveBeenCalledWith({ environmentId: 10, instanceIds: [1, 2] });
        expect(hardDelete).toHaveBeenCalledWith('db', { instanceIds: [1, 2] }, { environmentId: 10 });
        expect(order).toEqual(['delete schedules', 'hard delete instances']);
    });

    it('propagates search errors without deleting schedules or instances', async () => {
        const error = new Error('failed_to_search_function_instances');
        search.mockReset().mockResolvedValue(Err(error));

        await expect(deleteFunctionInstancesData({ environmentId: 10, filter: { connectionIds: [20] } }, opts)).rejects.toBe(error);

        expect(deleteFunctionSchedules).not.toHaveBeenCalled();
        expect(hardDelete).not.toHaveBeenCalled();
    });

    it('propagates schedule deletion errors without deleting instances', async () => {
        const error = new Error('failed_to_delete_function_schedules');
        deleteFunctionSchedules.mockReset().mockResolvedValue(Err(error));

        await expect(deleteFunctionInstancesData({ environmentId: 10, filter: { connectionIds: [20] } }, opts)).rejects.toBe(error);

        expect(hardDelete).not.toHaveBeenCalled();
    });

    it('fails when not all found instances are hard-deleted', async () => {
        hardDelete.mockReset().mockResolvedValue(Ok([{ id: 1 }]));

        await expect(deleteFunctionInstancesData({ environmentId: 10, filter: { connectionIds: [20] } }, opts)).rejects.toThrow(
            'failed_to_hard_delete_all_function_instances'
        );
    });
});
