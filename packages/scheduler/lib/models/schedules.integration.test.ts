import { setTimeout } from 'timers/promises';

import { uuidv7 } from 'uuidv7';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import * as schedules from './schedules.js';
import { getTestDbClient } from '../db/helpers.test.js';

import type { Schedule } from '../types.js';
import type knex from 'knex';

describe('Schedules', () => {
    const dbClient = getTestDbClient();
    const db = dbClient.db;
    beforeEach(async () => {
        await dbClient.migrate();
    });
    afterEach(async () => {
        await dbClient.clearDatabase();
    });

    it('should be successfully created', async () => {
        const schedule = await createSchedule(db);
        expect(schedule).toMatchObject({
            id: expect.any(String) as string,
            name: 'Test Schedule',
            state: 'STARTED',
            payload: { foo: 'bar' },
            startsAt: expect.toBeIsoDateTimezone(),
            frequencyMs: 300_000,
            createdAt: expect.toBeIsoDateTimezone(),
            updatedAt: expect.toBeIsoDateTimezone(),
            deletedAt: null,
            lastScheduledTaskId: null
        });
    });
    it('should be successfully retrieved', async () => {
        const schedule = await createSchedule(db);
        const retrieved = (await schedules.get(db, schedule.id)).unwrap();
        expect(retrieved).toMatchObject(schedule);
    });
    it('should be successfully deleted', async () => {
        const schedule = await createSchedule(db);
        await setTimeout(1);
        const deleted = (await schedules.remove(db, schedule.id)).unwrap();
        expect(deleted.state).toBe('DELETED');
        expect(deleted.updatedAt.getTime()).toBeGreaterThan(schedule.updatedAt.getTime());
        expect(deleted.deletedAt).toBeInstanceOf(Date);
    });
    it('should be successfully paused/unpaused', async () => {
        const schedule = await createSchedule(db);
        await setTimeout(1);
        const paused = (await schedules.transitionState(db, schedule.id, 'PAUSED')).unwrap();
        expect(paused.state).toBe('PAUSED');
        expect(paused.updatedAt.getTime()).toBeGreaterThan(schedule.updatedAt.getTime());

        const unpaused = (await schedules.transitionState(db, schedule.id, 'STARTED')).unwrap();
        expect(unpaused.state).toBe('STARTED');
        expect(unpaused.updatedAt.getTime()).toBeGreaterThan(schedule.updatedAt.getTime());
    });
    it('should fail when pausing/unpausing a deleted schedule', async () => {
        const schedule = await createSchedule(db);
        await schedules.remove(db, schedule.id);
        const paused = await schedules.transitionState(db, schedule.id, 'PAUSED');
        expect(paused.isErr()).toBe(true);
        const unpaused = await schedules.transitionState(db, schedule.id, 'STARTED');
        expect(unpaused.isErr()).toBe(true);
    });
    it('should be successfully updated', async () => {
        const schedule = await createSchedule(db);
        await setTimeout(1);
        const newFrequency = 600_000; // 10 minutes
        const updated = (
            await schedules.update(db, {
                id: schedule.id,
                frequencyMs: newFrequency,
                payload: { i: 2 }
            })
        ).unwrap();
        expect(updated.frequencyMs).toBe(newFrequency);
        expect(updated.payload).toMatchObject({ i: 2 });
        expect(updated.updatedAt.getTime()).toBeGreaterThan(schedule.updatedAt.getTime());
        expect(updated.lastScheduledTaskId).toBeNull();
        expect(updated.lastScheduledTaskState).toBeNull();
        expect(updated.nextExecutionAt).toBeWithinMs(new Date(updated.startsAt.getTime() + newFrequency), 3_000);
    });
    it('should be searchable', async () => {
        const schedule = await createSchedule(db);
        const byName = (await schedules.search(db, { names: [schedule.name], limit: 10 })).unwrap();
        expect(byName).toEqual([schedule]);

        const started = (await schedules.search(db, { state: 'STARTED', limit: 10 })).unwrap();
        expect(started).toEqual([schedule]);

        const deleted = (await schedules.search(db, { state: 'DELETED', limit: 10 })).unwrap();
        expect(deleted).toEqual([]);
    });
    it('should set last scheduled task', async () => {
        const schedule = await createSchedule(db);
        await setTimeout(1);
        const taskId = uuidv7();
        const taskState = 'STARTED';

        const [updated] = (await schedules.setLastScheduledTask(db, [{ id: schedule.id, taskId, taskState }])).unwrap();
        expect(updated?.updatedAt.getTime()).toBeGreaterThan(schedule.updatedAt.getTime());
        expect(updated?.lastScheduledTaskId).toBe(taskId);
        expect(updated?.lastScheduledTaskState).toBe(taskState);
        expect(updated?.nextExecutionAt).toEqual(schedule.nextExecutionAt);
    });
    it('should update last scheduled task state', async () => {
        const schedule = await createSchedule(db);
        await setTimeout(1);
        const taskId = uuidv7();

        await schedules.setLastScheduledTask(db, [{ id: schedule.id, taskId, taskState: 'CREATED' }]);

        const taskState = 'SUCCEEDED';
        const [updated] = (await schedules.updateLastScheduledTaskState(db, { taskIds: [taskId], taskState })).unwrap();
        expect(updated?.updatedAt.getTime()).toBeGreaterThan(schedule.updatedAt.getTime());
        expect(updated?.lastScheduledTaskState).toBe(taskState);
        // The next execution should be set to the next due date based on the frequency
        expect(updated?.nextExecutionAt).toBeWithinMs(new Date(schedule.startsAt.getTime() + schedule.frequencyMs), 3_000);
    });
});

async function createSchedule(db: knex.Knex): Promise<Schedule> {
    return (
        await schedules.create(db, {
            name: 'Test Schedule',
            state: 'STARTED',
            payload: { foo: 'bar' },
            startsAt: new Date(),
            frequencyMs: 300_000,
            groupKey: 'test-group-key',
            retryMax: 1,
            createdToStartedTimeoutSecs: 1,
            startedToCompletedTimeoutSecs: 1,
            heartbeatTimeoutSecs: 1,
            lastScheduledTaskId: null,
            lastScheduledTaskState: null
        })
    ).unwrap();
}
