import { setTimeout } from 'timers/promises';

import { uuidv7 } from 'uuidv7';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDbClient } from '../db/helpers.test.js';
import * as schedules from './schedules.js';

import type { Schedule } from '../types.js';
import type knex from 'knex';

describe('Schedules', () => {
    const dbClient = getTestDbClient('scheduler_schedules');
    const db = dbClient.db;
    beforeEach(async () => {
        await dbClient.migrate();
    });
    afterEach(async () => {
        await dbClient.clearDatabase();
    });

    // Close the knex pool. Nine of these suites leak one otherwise, which exhausts Postgres
    // once they share a process with the rest of the suite.
    afterAll(async () => {
        await dbClient.destroy();
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
    it('returns an existing schedule without changing any fields', async () => {
        const schedule = await createSchedule(db);

        const duplicate = await schedules.create(db, {
            name: schedule.name,
            state: 'PAUSED',
            payload: { foo: 'updated' },
            startsAt: new Date(),
            frequencyMs: 600_000,
            groupKey: 'updated-group-key',
            retryMax: 2,
            createdToStartedTimeoutSecs: 2,
            startedToCompletedTimeoutSecs: 3,
            heartbeatTimeoutSecs: 4,
            lastScheduledTaskId: null,
            lastScheduledTaskState: null
        });

        expect(duplicate.unwrap()).toEqual(schedule);
        const existing = (await schedules.get(db, schedule.id)).unwrap();
        expect(existing).toEqual(schedule);
    });
    it('should resurrect a soft-deleted schedule', async () => {
        const schedule = await createSchedule(db);
        const taskId = uuidv7();
        await schedules.setLastScheduledTask(db, [{ id: schedule.id, taskId, taskState: 'SUCCEEDED' }]);
        await schedules.remove(db, schedule.id);

        const resurrected = (
            await schedules.create(db, {
                name: schedule.name,
                state: 'PAUSED',
                payload: { foo: 'restored' },
                startsAt: new Date(),
                frequencyMs: 600_000,
                groupKey: 'restored-group-key',
                retryMax: 2,
                createdToStartedTimeoutSecs: 2,
                startedToCompletedTimeoutSecs: 3,
                heartbeatTimeoutSecs: 4,
                lastScheduledTaskId: null,
                lastScheduledTaskState: null
            })
        ).unwrap();

        expect(resurrected).toMatchObject({
            id: schedule.id,
            name: schedule.name,
            state: 'PAUSED',
            payload: { foo: 'restored' },
            frequencyMs: 600_000,
            groupKey: 'restored-group-key',
            retryMax: 2,
            createdToStartedTimeoutSecs: 2,
            startedToCompletedTimeoutSecs: 3,
            heartbeatTimeoutSecs: 4,
            deletedAt: null,
            lastScheduledTaskId: null,
            lastScheduledTaskState: null
        });
        expect(resurrected.createdAt).toEqual(schedule.createdAt);
    });

    it('returns all requested schedules and leaves live duplicates untouched', async () => {
        const existing = await createSchedule(db);
        const requested = [
            { ...existing, name: 'new-schedule', state: 'STARTED' as const },
            { ...existing, state: 'PAUSED' as const, frequencyMs: 900_000, payload: { changed: true } }
        ];
        const rows = (await schedules.createBatch(db, requested)).unwrap();
        expect(rows.map((row) => row.name).sort()).toEqual(requested.map((row) => row.name).sort());
        expect(rows.find((row) => row.name === existing.name)).toEqual(existing);
        expect(new Map((await schedules.createBatch(db, requested)).unwrap().map((row) => [row.name, row]))).toEqual(
            new Map(rows.map((row) => [row.name, row]))
        );
    });

    it('returns the same IDs when concurrent requests create the same schedule', async () => {
        const existing = await createSchedule(db);
        const props = [{ ...existing, name: 'concurrent-schedule', state: 'STARTED' as const }];
        const results = await Promise.all([schedules.createBatch(db, props), schedules.createBatch(db, props)]);
        expect(results[0]!.unwrap()).toEqual(results[1]!.unwrap());
        expect(await db.from(schedules.SCHEDULES_TABLE).where('name', 'concurrent-schedule')).toHaveLength(1);
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
    it('updates multiple schedules with their respective values and leaves unrelated schedules unchanged', async () => {
        const first = await createSchedule(db, 'first');
        const second = await createSchedule(db, 'second');
        const unrelated = await createSchedule(db, 'unrelated');
        await setTimeout(1);
        const entries = [
            { id: second.id, frequencyMs: 900_000, payload: { i: 3 } },
            { id: first.id, frequencyMs: 600_000, payload: { i: 2 } }
        ];
        const updated = (await schedules.update(db, entries)).unwrap();
        expect(updated).toHaveLength(2);
        const byId = new Map(updated.map((schedule) => [schedule.id, schedule]));
        for (const original of [first, second]) {
            const expected = entries.find((entry) => entry.id === original.id)!;
            const actual = byId.get(original.id)!;
            expect(actual.frequencyMs).toBe(expected.frequencyMs);
            expect(actual.payload).toEqual(expected.payload);
            expect(actual.updatedAt.getTime()).toBeGreaterThan(original.updatedAt.getTime());
            expect(actual.lastScheduledTaskId).toBeNull();
            expect(actual.lastScheduledTaskState).toBeNull();
            expect(actual.nextExecutionAt).toBeWithinMs(new Date(original.startsAt.getTime() + expected.frequencyMs), 3_000);
            expect((await schedules.get(db, original.id)).unwrap()).toEqual(actual);
        }
        expect((await schedules.get(db, unrelated.id)).unwrap()).toEqual(unrelated);
    });
    it('preserves omitted fields in payload-only and frequency-only updates', async () => {
        const payloadOnly = await createSchedule(db, 'payload-only');
        const frequencyOnly = await createSchedule(db, 'frequency-only');
        await setTimeout(1);

        const updated = (
            await schedules.update(db, [
                { id: payloadOnly.id, payload: { changed: true } },
                { id: frequencyOnly.id, frequencyMs: 600_000 }
            ])
        ).unwrap();

        expect(updated).toHaveLength(2);
        const byId = new Map(updated.map((schedule) => [schedule.id, schedule]));
        const payloadResult = byId.get(payloadOnly.id)!;
        expect(payloadResult.payload).toEqual({ changed: true });
        expect(payloadResult.frequencyMs).toBe(payloadOnly.frequencyMs);
        expect(payloadResult.nextExecutionAt).toEqual(payloadOnly.nextExecutionAt);

        const frequencyResult = byId.get(frequencyOnly.id)!;
        expect(frequencyResult.frequencyMs).toBe(600_000);
        expect(frequencyResult.payload).toEqual(frequencyOnly.payload);
        expect(frequencyResult.nextExecutionAt).toBeWithinMs(new Date(frequencyOnly.startsAt.getTime() + 600_000), 3_000);

        expect((await schedules.get(db, payloadOnly.id)).unwrap()).toEqual(payloadResult);
        expect((await schedules.get(db, frequencyOnly.id)).unwrap()).toEqual(frequencyResult);
    });
    it('rejects duplicate update IDs without changing the schedule', async () => {
        const schedule = await createSchedule(db);
        const result = await schedules.update(db, [
            { id: schedule.id, frequencyMs: 600_000, payload: { i: 2 } },
            { id: schedule.id, frequencyMs: 900_000, payload: { i: 3 } }
        ]);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.message).toBe('Duplicate schedule IDs in update');
        }
        expect((await schedules.get(db, schedule.id)).unwrap()).toEqual(schedule);
    });
    it('batch update fails when a schedule is missing', async () => {
        const schedule = await createSchedule(db);
        const result = await schedules.update(db, [
            { id: schedule.id, frequencyMs: 600_000, payload: { i: 2 } },
            { id: uuidv7(), frequencyMs: 900_000 }
        ]);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.message).toContain('Some schedules were not found during update');
        }
        expect((await schedules.get(db, schedule.id)).unwrap()).toEqual(schedule); // The existing schedule should remain unchanged
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
        const [updated] = (await schedules.scheduleNextExecution(db, { taskIds: [taskId], taskState })).unwrap();
        expect(updated?.updatedAt.getTime()).toBeGreaterThan(schedule.updatedAt.getTime());
        expect(updated?.lastScheduledTaskState).toBe(taskState);
        // The next execution should be set to the next due date based on the frequency
        expect(updated?.nextExecutionAt).toBeWithinMs(new Date(schedule.startsAt.getTime() + schedule.frequencyMs), 3_000);
    });
    it('should hard-delete schedules deleted longer than N days ago', async () => {
        const schedule = await createSchedule(db);
        await schedules.remove(db, schedule.id);
        const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
        await db.from('schedules').where('id', schedule.id).update({ deleted_at: twoDaysAgo });

        const deleted = (await schedules.hardDeleteOlderThanNDays(db, 1)).unwrap();

        expect(deleted.map((s) => s.id)).toContain(schedule.id);
    });
    it('should override next execution when nextExecutionInMs is provided', async () => {
        const schedule = await createSchedule(db);
        const taskId = uuidv7();
        await schedules.setLastScheduledTask(db, [{ id: schedule.id, taskId, taskState: 'CREATED' }]);

        const nextExecutionInMs = 9_999_999;
        const [updated] = (await schedules.scheduleNextExecution(db, { taskIds: [taskId], taskState: 'SUCCEEDED', nextExecutionInMs })).unwrap();
        expect(updated?.nextExecutionAt).toBeWithinMs(new Date(Date.now() + nextExecutionInMs), 3_000);
    });
});

async function createSchedule(db: knex.Knex, name = 'Test Schedule'): Promise<Schedule> {
    return (
        await schedules.create(db, {
            name,
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
