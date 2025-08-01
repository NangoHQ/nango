import { uuidv7 } from 'uuidv7';

import { Err, Ok, stringifyError } from '@nangohq/utils';

import type { Schedule, ScheduleProps, ScheduleState, TaskState } from '../types.js';
import type { Result } from '@nangohq/utils';
import type knex from 'knex';
import type { JsonValue } from 'type-fest';

export const SCHEDULES_TABLE = 'schedules';

interface ScheduleStateTransition {
    from: ScheduleState;
    to: ScheduleState;
}

export const validScheduleStateTransitions = [
    { from: 'STARTED', to: 'PAUSED' },
    { from: 'STARTED', to: 'DELETED' },
    { from: 'PAUSED', to: 'STARTED' },
    { from: 'PAUSED', to: 'DELETED' }
] as const;
export type ValidScheduleStateTransitions = (typeof validScheduleStateTransitions)[number];

const ScheduleStateTransition = {
    validate({ from, to }: { from: ScheduleState; to: ScheduleState }): Result<ValidScheduleStateTransitions> {
        const transition = validScheduleStateTransitions.find((t) => t.from === from && t.to === to);
        if (transition) {
            return Ok(transition);
        } else {
            return Err(new Error(`Invalid state transition from ${from} to ${to}`));
        }
    }
};

export interface DbSchedule {
    readonly id: string;
    readonly name: string;
    state: ScheduleState;
    readonly starts_at: Date;
    frequency: string;
    payload: JsonValue;
    readonly group_key: string;
    readonly retry_max: number;
    readonly created_to_started_timeout_secs: number;
    readonly started_to_completed_timeout_secs: number;
    readonly heartbeat_timeout_secs: number;
    readonly created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
    last_scheduled_task_id: string | null;
    last_scheduled_task_state: TaskState | null;
    next_execution_at: Date;
}

// knex uses https://github.com/bendrucker/postgres-interval
function postgresIntervalInMs(i: {
    years?: number;
    months?: number;
    days?: number;
    hours?: number;
    minutes?: number;
    seconds?: number;
    milliseconds?: number;
}): number {
    return (
        (i.years ?? 0) * 31536000000 +
        (i.months ?? 0) * 2592000000 +
        (i.days ?? 0) * 86400000 +
        (i.hours ?? 0) * 3600000 +
        (i.minutes ?? 0) * 60000 +
        (i.seconds ?? 0) * 1000 +
        (i.milliseconds ?? 0)
    );
}

export const DbSchedule = {
    to: (schedule: Schedule): DbSchedule => ({
        id: schedule.id.toString(),
        name: schedule.name,
        state: schedule.state,
        starts_at: schedule.startsAt,
        frequency: `${schedule.frequencyMs} milliseconds`,
        payload: schedule.payload,
        group_key: schedule.groupKey,
        retry_max: schedule.retryMax,
        created_to_started_timeout_secs: schedule.createdToStartedTimeoutSecs,
        started_to_completed_timeout_secs: schedule.startedToCompletedTimeoutSecs,
        heartbeat_timeout_secs: schedule.heartbeatTimeoutSecs,
        created_at: schedule.createdAt,
        updated_at: schedule.updatedAt,
        deleted_at: schedule.deletedAt,
        last_scheduled_task_id: schedule.lastScheduledTaskId,
        last_scheduled_task_state: schedule.lastScheduledTaskState,
        next_execution_at: schedule.nextExecutionAt
    }),
    from: (dbSchedule: DbSchedule): Schedule => ({
        id: dbSchedule.id,
        name: dbSchedule.name,
        state: dbSchedule.state,
        startsAt: dbSchedule.starts_at,
        frequencyMs: postgresIntervalInMs(dbSchedule.frequency as any),
        payload: dbSchedule.payload,
        groupKey: dbSchedule.group_key,
        retryMax: dbSchedule.retry_max,
        createdToStartedTimeoutSecs: dbSchedule.created_to_started_timeout_secs,
        startedToCompletedTimeoutSecs: dbSchedule.started_to_completed_timeout_secs,
        heartbeatTimeoutSecs: dbSchedule.heartbeat_timeout_secs,
        createdAt: dbSchedule.created_at,
        updatedAt: dbSchedule.updated_at,
        deletedAt: dbSchedule.deleted_at,
        lastScheduledTaskId: dbSchedule.last_scheduled_task_id,
        lastScheduledTaskState: dbSchedule.last_scheduled_task_state,
        nextExecutionAt: dbSchedule.next_execution_at
    })
};

export async function create(db: knex.Knex, props: ScheduleProps): Promise<Result<Schedule>> {
    const now = new Date();
    const newSchedule: Schedule = {
        ...props,
        id: uuidv7(),
        payload: props.payload,
        startsAt: now,
        frequencyMs: props.frequencyMs,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        lastScheduledTaskId: null,
        nextExecutionAt: now
    };
    try {
        const inserted = await db.from<DbSchedule>(SCHEDULES_TABLE).insert(DbSchedule.to(newSchedule)).returning('*');
        if (!inserted?.[0]) {
            return Err(new Error(`Error: no schedule '${props.name}' created`));
        }
        return Ok(DbSchedule.from(inserted[0]));
    } catch (err) {
        return Err(new Error(`Error creating schedule '${props.name}': ${stringifyError(err)}`));
    }
}

export async function get(db: knex.Knex, scheduleId: string): Promise<Result<Schedule>> {
    try {
        const schedule = await db.from<DbSchedule>(SCHEDULES_TABLE).where('id', scheduleId).first();
        if (!schedule) {
            return Err(new Error(`Error: no schedule '${scheduleId}' found`));
        }
        return Ok(DbSchedule.from(schedule));
    } catch (err) {
        return Err(new Error(`Error getting schedule '${scheduleId}': ${stringifyError(err)}`));
    }
}

export async function transitionState(db: knex.Knex, scheduleId: string, to: ScheduleState): Promise<Result<Schedule>> {
    try {
        const getSchedule = await get(db, scheduleId);
        if (getSchedule.isErr()) {
            return Err(new Error(`Error: no schedule '${scheduleId}' found`));
        }
        const transition = ScheduleStateTransition.validate({ from: getSchedule.value.state, to });
        if (transition.isErr()) {
            return Err(transition.error);
        }
        const now = new Date();
        const values = {
            state: to,
            updated_at: now,
            ...(to === 'DELETED' ? { deleted_at: now } : {})
        };
        const updated = await db.from<DbSchedule>(SCHEDULES_TABLE).where('id', scheduleId).update(values).returning('*');
        if (!updated?.[0]) {
            return Err(new Error(`Error: no schedule '${scheduleId}' updated`));
        }
        return Ok(DbSchedule.from(updated[0]));
    } catch (err) {
        return Err(new Error(`Error transitioning schedule '${scheduleId}': ${stringifyError(err)}`));
    }
}

export async function update(db: knex.Knex, props: Partial<Pick<ScheduleProps, 'frequencyMs' | 'payload'>> & { id: string }): Promise<Result<Schedule>> {
    try {
        const newValues = {
            ...(props.frequencyMs ? { frequency: `${props.frequencyMs} milliseconds` } : {}),
            ...(props.payload ? { payload: props.payload } : {}),
            ...(props.frequencyMs
                ? {
                      next_execution_at: db.raw(
                          `starts_at + (
                                CEILING(
                                    EXTRACT(EPOCH FROM (NOW() - starts_at)) / (? / 1000.0)
                                ) * INTERVAL '1 millisecond' * ?
                          )`,
                          [props.frequencyMs, props.frequencyMs]
                      )
                  }
                : {}),
            updated_at: new Date()
        };
        const updated = await db.from<DbSchedule>(SCHEDULES_TABLE).where('id', props.id).update(newValues).returning('*');
        if (!updated?.[0]) {
            return Err(new Error(`Error: no schedule '${props.id}' updated`));
        }
        return Ok(DbSchedule.from(updated[0]));
    } catch (err) {
        return Err(new Error(`Error updating schedule '${props.id}': ${stringifyError(err)}`));
    }
}

export async function setLastScheduledTask(db: knex.Knex, updates: { id: string; taskId: string; taskState: TaskState }[]): Promise<Result<Schedule[]>> {
    try {
        if (updates.length === 0) {
            return Ok([]);
        }

        const bindings = updates.flatMap((u) => [u.id, u.taskId, u.taskState]);
        const values = updates.map(() => '(?, ?::uuid, ?::task_states)').join(', ');

        const updated = await db.raw(
            `UPDATE ${SCHEDULES_TABLE}
            SET
                last_scheduled_task_id = v.task_id,
                last_scheduled_task_state = v.task_state,
                updated_at = NOW()
            FROM (VALUES ${values}) AS v(id, task_id, task_state)
            WHERE ${SCHEDULES_TABLE}.id = v.id::uuid
            RETURNING ${SCHEDULES_TABLE}.*`,
            bindings
        );

        const result = updated.rows || updated;

        if (result.length === 0) {
            return Err(new Error(`Error: no schedules updated for tasks ${updates.map((u) => u.taskId).join(', ')}`));
        }
        return Ok(result.map(DbSchedule.from));
    } catch (err) {
        return Err(new Error(`Error setting last scheduled task ${JSON.stringify(updates)}: ${stringifyError(err)}`));
    }
}

export async function updateLastScheduledTaskState(
    db: knex.Knex,
    { taskIds, taskState }: { taskIds: string[]; taskState: TaskState }
): Promise<Result<Schedule[]>> {
    try {
        if (taskIds.length <= 0) {
            return Ok([]);
        }
        const updated = await db(SCHEDULES_TABLE)
            .update({
                updated_at: db.fn.now(),
                last_scheduled_task_state: taskState,
                next_execution_at: db.raw('starts_at + CEILING(EXTRACT(EPOCH FROM (NOW() - starts_at)) / EXTRACT(EPOCH FROM frequency)) * frequency')
            })
            .whereIn('last_scheduled_task_id', taskIds)
            .returning('*');
        return Ok(updated.map(DbSchedule.from));
    } catch (err) {
        return Err(new Error(`Error updating last scheduled tasks ${taskIds.join(', ')}: ${stringifyError(err)}`));
    }
}

export async function remove(db: knex.Knex, id: string): Promise<Result<Schedule>> {
    try {
        const now = new Date();
        const deleted = await db
            .from<DbSchedule>(SCHEDULES_TABLE)
            .where('id', id)
            .update({ state: 'DELETED', deleted_at: now, updated_at: now })
            .returning('*');
        if (!deleted?.[0]) {
            return Err(new Error(`Error: no schedule '${id}' deleted`));
        }
        return Ok(DbSchedule.from(deleted[0]));
    } catch (err) {
        return Err(new Error(`Error deleting schedule '${id}': ${stringifyError(err)}`));
    }
}

export async function search(
    db: knex.Knex,
    params: { id?: string; names?: string[]; state?: ScheduleState; limit: number; forUpdate?: boolean }
): Promise<Result<Schedule[]>> {
    try {
        const query = db.from<DbSchedule>(SCHEDULES_TABLE).limit(params.limit);
        if (params.id) {
            query.where('id', params.id);
        }
        if (params.names) {
            query.whereIn('name', params.names);
        }
        if (params.state) {
            query.where('state', params.state);
        }
        if (params.forUpdate) {
            query.forUpdate();
        }
        const schedules = await query;
        return Ok(schedules.map(DbSchedule.from));
    } catch (err) {
        return Err(new Error(`Error searching schedules: ${stringifyError(err)}`));
    }
}

export async function hardDeleteOlderThanNDays(db: knex.Knex, days: number): Promise<Result<DbSchedule[]>> {
    try {
        // NOTE: only deleting one schedule at a time to avoid massive cascading deletes of tasks
        const deleted = await db
            .from<DbSchedule>(SCHEDULES_TABLE)
            .where(
                'id',
                '=',
                db.raw(`ANY(ARRAY(
                    SELECT "id"
                    FROM ${SCHEDULES_TABLE}
                    WHERE "deleted_at" < NOW() - INTERVAL '${days} days'
                    ORDER BY "id" ASC
                    LIMIT 1
                  ))`)
            )
            .del()
            .returning('*');
        return Ok(deleted);
    } catch (err) {
        return Err(new Error(`Error hard deleting schedules older than ${days} days: ${stringifyError(err)}`));
    }
}
