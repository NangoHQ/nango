import { expect, describe, it, beforeEach, afterEach } from 'vitest';
import * as schedules from './schedules.js';
import { getTestDbClient } from '../db/helpers.test.js';
import type { Schedule } from '../types.js';
import type knex from 'knex';
import { uuidv7 } from 'uuidv7';
import { setTimeout } from 'timers/promises';

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
        const updated = (await schedules.update(db, { id: schedule.id, frequencyMs: 600_000, payload: { i: 2 }, lastScheduledTaskId: uuidv7() })).unwrap();
        expect(updated.frequencyMs).toBe(600_000);
        expect(updated.payload).toMatchObject({ i: 2 });
        expect(updated.updatedAt.getTime()).toBeGreaterThan(schedule.updatedAt.getTime());
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
            lastScheduledTaskId: null
        })
    ).unwrap();
}
