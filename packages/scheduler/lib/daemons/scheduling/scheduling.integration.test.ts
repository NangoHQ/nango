import { uuidv7 } from 'uuidv7';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SchedulingDaemon } from './scheduling.daemon.js';
import { dueSchedules } from './scheduling.js';
import { defaultSchedulerConfig } from '../../config.js';
import { DatabaseClient, defaultDatabaseClientOptions } from '../../db/client.js';
import { getTestDbClient } from '../../db/helpers.test.js';
import { DbSchedule, SCHEDULES_TABLE } from '../../models/schedules.js';
import * as schedules from '../../models/schedules.js';
import { DbTask, TASKS_TABLE } from '../../models/tasks.js';
import * as tasks from '../../models/tasks.js';

import type { DBTask } from '../../models/tasks.js';
import type { Schedule, ScheduleState, Task, TaskState } from '../../types.js';
import type knex from 'knex';

describe('dueSchedules', () => {
    const dbClient = getTestDbClient();
    const db = dbClient.db;

    beforeEach(async () => {
        await dbClient.migrate();
    });

    afterEach(async () => {
        await dbClient.clearDatabase();
    });

    it('should not return schedule that is deleted', async () => {
        await addSchedule(db, { state: 'DELETED', frequency: '3 minutes' });
        const due = await dueSchedules(db);
        expect(due.isOk()).toBe(true);
        expect(due.unwrap().length).toBe(0);
    });
    it('should not return schedule that is paused', async () => {
        await addSchedule(db, { state: 'PAUSED', frequency: '3 minutes' });
        const due = await dueSchedules(db);
        expect(due.isOk()).toBe(true);
        expect(due.unwrap().length).toBe(0);
    });
    it('should not return schedule that is set to start in the future', async () => {
        await addSchedule(db, { state: 'STARTED', frequency: '3 minutes', startsAt: Seconds.after(1 * 60) });
        const due = await dueSchedules(db);
        expect(due.isOk()).toBe(true);
        expect(due.unwrap().length).toBe(0);
    });
    it('should not return schedule that have a recent task completed', async () => {
        const startsAt = Seconds.ago(-5 * 60); // 5 minutes ago
        const schedule = await addSchedule(db, { startsAt, frequency: '10 minutes' });
        await addTask(db, {
            scheduleId: schedule.id,
            state: 'SUCCEEDED',
            startsAfter: startsAt,
            lastStateTransitionAt: Seconds.after(20, startsAt)
        });
        const due = await dueSchedules(db);
        expect(due.isOk()).toBe(true);
        expect(due.unwrap().length).toBe(0);
    });
    it('should not return schedule that have a task running', async () => {
        const startsAt = Seconds.ago(-5 * 60); // 5 minutes ago
        const schedule = await addSchedule(db, { startsAt, frequency: '10 minutes' });
        await addTask(db, {
            scheduleId: schedule.id,
            state: 'STARTED',
            startsAfter: startsAt,
            lastStateTransitionAt: startsAt
        });
        const due = await dueSchedules(db);
        expect(due.isOk()).toBe(true);
        expect(due.unwrap().length).toBe(0);
    });
    it('should return schedule that has never run', async () => {
        await addSchedule(db);
        const due = await dueSchedules(db);
        expect(due.isOk()).toBe(true);
        expect(due.unwrap().length).toBe(1);
    });
    it('should return schedule that has not run recently', async () => {
        const startsAt = Seconds.ago(6 * 60); // 10 minutes ago
        const schedule = await addSchedule(db, { startsAt, frequency: '5 minutes' });
        await addTask(db, {
            scheduleId: schedule.id,
            state: 'SUCCEEDED',
            startsAfter: startsAt,
            lastStateTransitionAt: Seconds.after(20, startsAt)
        });
        const due = await dueSchedules(db);
        expect(due.isOk()).toBe(true);
        expect(due.unwrap().length).toBe(1);
    });
});

describe('SchedulingDaemon', () => {
    // Dedicated schema: running the daemon against the shared 'scheduler' schema races with the
    // looping daemons in scheduler.integration.test.ts via SKIP LOCKED.
    const dbClient = new DatabaseClient({
        ...defaultDatabaseClientOptions,
        url: `postgres://${process.env['NANGO_DB_USER']}:${process.env['NANGO_DB_PASSWORD']}@${process.env['NANGO_DB_HOST']}:${process.env['NANGO_DB_PORT']}/${process.env['NANGO_DB_NAME']}`,
        schema: 'scheduler_daemon'
    });
    const db = dbClient.db;

    beforeEach(async () => {
        await dbClient.migrate();
    });

    afterEach(async () => {
        await dbClient.clearDatabase();
    });

    it('should stamp materialized tasks with the configured recurringGroupMaxConcurrency', async () => {
        const schedule = await addSchedule(db);
        const daemon = new SchedulingDaemon({
            db,
            abortSignal: new AbortController().signal,
            tickIntervalMs: defaultSchedulerConfig.daemons.schedulingTickIntervalMs,
            groupTaskCap: defaultSchedulerConfig.limits.groupTaskCap,
            recurringGroupMaxConcurrency: defaultSchedulerConfig.limits.recurringGroupMaxConcurrency,
            onScheduling: () => {},
            onEvent: () => {},
            onError: () => {}
        });

        await daemon.run();

        const created = (await tasks.search(db, { scheduleId: schedule.id })).unwrap();
        expect(created).toHaveLength(1);
        expect(created[0]?.groupMaxConcurrency).toBe(defaultSchedulerConfig.limits.recurringGroupMaxConcurrency);
    });
});

const Seconds = {
    after: (seconds: number, date: Date = new Date()): Date => {
        return new Date(date.getTime() + seconds * 1000);
    },
    ago: (seconds: number, date: Date = new Date()): Date => {
        return new Date(date.getTime() - seconds * 1000);
    }
};

async function addSchedule(db: knex.Knex, params?: { state?: ScheduleState; startsAt?: Date; frequency?: string }): Promise<Schedule> {
    const schedule: DbSchedule = {
        id: uuidv7(),
        name: Math.random().toString(36).substring(7),
        state: params?.state || 'STARTED',
        starts_at: params?.startsAt || new Date(),
        frequency: params?.frequency || '5 minutes',
        payload: {},
        group_key: Math.random().toString(36).substring(7),
        retry_max: 0,
        created_to_started_timeout_secs: 1,
        started_to_completed_timeout_secs: 1,
        heartbeat_timeout_secs: 1,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: params?.state === 'DELETED' ? new Date() : null,
        last_scheduled_task_id: null,
        last_scheduled_task_state: null,
        next_execution_at: params?.startsAt || new Date()
    };
    const res = await db.from<DbSchedule>(SCHEDULES_TABLE).insert(schedule).returning('*');
    const inserted = res[0];
    if (!inserted) {
        throw new Error('Failed to insert schedule');
    }
    return DbSchedule.from(inserted);
}

async function addTask(
    db: knex.Knex,
    params?: {
        scheduleId?: string;
        state?: TaskState;
        lastStateTransitionAt?: Date;
        startsAfter?: Date;
    }
): Promise<Task> {
    const task: DBTask = {
        id: uuidv7(),
        schedule_id: params?.scheduleId || uuidv7(),
        group_key: Math.random().toString(36).substring(7),
        group_max_concurrency: 0,
        name: Math.random().toString(36).substring(7),
        state: params?.state || 'CREATED',
        payload: {},
        retry_max: 0,
        retry_count: 0,
        created_at: params?.startsAfter || new Date(),
        last_state_transition_at: params?.lastStateTransitionAt || new Date(),
        starts_after: params?.startsAfter || new Date(),
        created_to_started_timeout_secs: 1,
        started_to_completed_timeout_secs: 1,
        heartbeat_timeout_secs: 1,
        last_heartbeat_at: new Date(),
        output: {},
        terminated: params?.state !== 'CREATED' && params?.state !== 'STARTED',
        retry_key: null,
        owner_key: null
    };
    const res = await db.from<DBTask>(TASKS_TABLE).insert(task).returning('*');
    const inserted = res[0];
    if (!inserted) {
        throw new Error('Failed to insert task');
    }
    if (params?.scheduleId) {
        await schedules.setLastScheduledTask(db, [
            {
                id: params.scheduleId,
                taskId: inserted.id,
                taskState: inserted.state
            }
        ]);
    }
    return DbTask.from(inserted);
}
