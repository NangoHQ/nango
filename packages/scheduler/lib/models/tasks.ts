import { uuidv4, uuidv7 } from 'uuidv7';

import { Err, Ok, stringToHash, stringifyError } from '@nangohq/utils';

import { taskStates } from '../types.js';
import { SCHEDULES_TABLE } from './schedules.js';

import type { Task, TaskNonTerminalState, TaskState, TaskTerminalState } from '../types.js';
import type { Result } from '@nangohq/utils';
import type knex from 'knex';
import type { JsonValue, SetOptional } from 'type-fest';

export const TASKS_TABLE = 'tasks';

export type TaskProps = SetOptional<
    Omit<Task, 'id' | 'createdAt' | 'state' | 'lastStateTransitionAt' | 'lastHeartbeatAt' | 'output' | 'terminated'>,
    'retryKey'
>;

interface TaskStateTransition {
    from: TaskState;
    to: TaskState;
}

export const validTaskStateTransitions = [
    { from: 'CREATED', to: 'STARTED' },
    { from: 'CREATED', to: 'CANCELLED' },
    { from: 'CREATED', to: 'EXPIRED' },
    { from: 'STARTED', to: 'SUCCEEDED' },
    { from: 'STARTED', to: 'FAILED' },
    { from: 'STARTED', to: 'CANCELLED' },
    { from: 'STARTED', to: 'EXPIRED' }
] as const;
const validToStates: TaskState[] = taskStates.filter((state) => {
    return validTaskStateTransitions.every((transition) => transition.from !== state);
});
export type ValidTaskStateTransitions = (typeof validTaskStateTransitions)[number];

const TaskStateTransition = {
    validate({ from, to }: { from: TaskState; to: TaskState }): Result<ValidTaskStateTransitions> {
        const transition = validTaskStateTransitions.find((t) => t.from === from && t.to === to);
        if (transition) {
            return Ok(transition);
        } else {
            return Err(new Error(`Invalid state transition from ${from} to ${to}`));
        }
    }
};

export interface DBTask {
    readonly id: string;
    readonly name: string;
    readonly payload: JsonValue;
    readonly group_key: string;
    readonly group_max_concurrency: number;
    readonly retry_max: number;
    readonly retry_count: number;
    readonly starts_after: Date;
    readonly created_to_started_timeout_secs: number;
    readonly started_to_completed_timeout_secs: number;
    readonly heartbeat_timeout_secs: number;
    readonly created_at: Date;
    state: TaskState;
    last_state_transition_at: Date;
    last_heartbeat_at: Date;
    output: JsonValue | null;
    terminated: boolean;
    readonly schedule_id: string | null;
    readonly retry_key: string | null;
    readonly owner_key: string | null;
}
export const DbTask = {
    to: (task: Task): DBTask => {
        return {
            id: task.id,
            name: task.name,
            payload: task.payload,
            group_key: task.groupKey,
            group_max_concurrency: task.groupMaxConcurrency,
            retry_max: task.retryMax,
            retry_count: task.retryCount,
            starts_after: task.startsAfter,
            created_to_started_timeout_secs: task.createdToStartedTimeoutSecs,
            started_to_completed_timeout_secs: task.startedToCompletedTimeoutSecs,
            heartbeat_timeout_secs: task.heartbeatTimeoutSecs,
            created_at: task.createdAt,
            state: task.state,
            last_state_transition_at: task.lastStateTransitionAt,
            last_heartbeat_at: task.lastHeartbeatAt,
            output: task.output,
            terminated: task.terminated,
            schedule_id: task.scheduleId,
            retry_key: task.retryKey,
            owner_key: task.ownerKey
        };
    },
    from: (dbTask: DBTask): Task => {
        return {
            id: dbTask.id,
            name: dbTask.name,
            payload: dbTask.payload,
            groupKey: dbTask.group_key,
            groupMaxConcurrency: dbTask.group_max_concurrency,
            retryMax: dbTask.retry_max,
            retryCount: dbTask.retry_count,
            startsAfter: dbTask.starts_after,
            createdToStartedTimeoutSecs: dbTask.created_to_started_timeout_secs,
            startedToCompletedTimeoutSecs: dbTask.started_to_completed_timeout_secs,
            heartbeatTimeoutSecs: dbTask.heartbeat_timeout_secs,
            createdAt: dbTask.created_at,
            state: dbTask.state,
            lastStateTransitionAt: dbTask.last_state_transition_at,
            lastHeartbeatAt: dbTask.last_heartbeat_at,
            output: dbTask.output,
            terminated: dbTask.terminated,
            scheduleId: dbTask.schedule_id,
            retryKey: dbTask.retry_key,
            ownerKey: dbTask.owner_key
        };
    }
};

export async function create(db: knex.Knex, taskProps: TaskProps): Promise<Result<Task>> {
    const now = new Date();
    const newTask: Task = {
        ...taskProps,
        id: uuidv7(),
        createdAt: now,
        state: 'CREATED',
        lastStateTransitionAt: now,
        lastHeartbeatAt: now,
        terminated: false,
        output: null,
        scheduleId: taskProps.scheduleId,
        retryKey: taskProps.retryKey || uuidv4()
    };
    try {
        const inserted = await db.from<DBTask>(TASKS_TABLE).insert(DbTask.to(newTask)).returning('*');
        if (!inserted?.[0]) {
            return Err(new Error(`Error: no task '${taskProps.name}' created`));
        }
        return Ok(DbTask.from(inserted[0]));
    } catch (err) {
        return Err(new Error(`Error creating task '${taskProps.name}': ${stringifyError(err)}`));
    }
}

export async function get(db: knex.Knex, taskId: string): Promise<Result<Task>> {
    const task = await db.from<DBTask>(TASKS_TABLE).where('id', taskId).first();
    if (!task) {
        return Err(new Error(`Task with id '${taskId}' not found`));
    }
    return Ok(DbTask.from(task));
}

export async function search(
    db: knex.Knex,
    params?: {
        ids?: string[];
        groupKey?: string;
        states?: TaskState[];
        scheduleId?: string;
        retryKey?: string;
        ownerKey?: string;
        limit?: number;
    }
): Promise<Result<Task[]>> {
    const query = db.from<DBTask>(TASKS_TABLE);
    if (params?.ids) {
        query.whereIn('id', params.ids);
    }
    if (params?.groupKey) {
        query.where('group_key', params.groupKey);
    }
    if (params?.states) {
        query.whereIn('state', params.states);
    }
    if (params?.scheduleId) {
        query.where('schedule_id', params.scheduleId);
    }
    if (params?.retryKey) {
        query.where('retry_key', params.retryKey);
    }
    if (params?.ownerKey) {
        query.where('owner_key', params.ownerKey);
    }
    const limit = params?.limit || 100;
    const tasks = await query.limit(limit).orderBy('id');
    return Ok(tasks.map(DbTask.from));
}

export async function heartbeat(db: knex.Knex, taskId: string): Promise<Result<Task>> {
    try {
        const updated = await db.from<DBTask>(TASKS_TABLE).where('id', taskId).update({ last_heartbeat_at: new Date() }).returning('*');
        if (!updated?.[0]) {
            return Err(new Error(`Error: Task with id '${taskId}' not updated`));
        }
        return Ok(DbTask.from(updated[0]));
    } catch (err) {
        return Err(new Error(`Error updating task ${taskId}: ${stringifyError(err)}`));
    }
}

export async function transitionState(
    db: knex.Knex,
    props:
        | {
              taskId: string;
              newState: TaskTerminalState;
              output: JsonValue;
          }
        | {
              taskId: string;
              newState: TaskNonTerminalState;
          }
): Promise<Result<Task>> {
    const task = await get(db, props.taskId);
    if (task.isErr()) {
        return Err(new Error(`Task with id '${props.taskId}' not found`));
    }

    const transition = TaskStateTransition.validate({ from: task.value.state, to: props.newState });
    if (transition.isErr()) {
        return Err(transition.error);
    }

    const output = 'output' in props ? props.output : null;
    const asPostgresJson = (val: JsonValue) => {
        if (val === null) {
            return null;
        }
        if (Array.isArray(val)) {
            // https://github.com/brianc/node-postgres/issues/442
            return JSON.stringify(val);
        }
        switch (typeof val) {
            case 'string': {
                return db.raw(`to_json(?::text)`, [val]);
            }
            default:
                return db.raw(`to_json(?::json)`, [val]);
        }
    };

    const updated = await db
        .from<DBTask>(TASKS_TABLE)
        .where('id', props.taskId)
        .update({
            state: transition.value.to,
            last_state_transition_at: new Date(),
            terminated: validToStates.includes(transition.value.to),
            output: asPostgresJson(output)
        })
        .returning('*');
    if (!updated?.[0]) {
        return Err(new Error(`Task with id '${props.taskId}' not found`));
    }

    return Ok(DbTask.from(updated[0]));
}

export async function dequeue(db: knex.Knex, { groupKey, limit }: { groupKey: string; limit: number }): Promise<Result<Task[]>> {
    try {
        const groupKeyPattern = groupKey.replace(/\*/g, '%');

        const tasks = await db.transaction(async (trx) => {
            // Acquire a lock to prevent concurrent dequeueing of the same group
            // in order to ensure max concurrency is respected
            await trx.raw(`SELECT pg_advisory_xact_lock(?) as "lock_dequeue_${groupKey}"`, [stringToHash(groupKey)]);
            return (
                trx
                    // 1. select created tasks that are ready to be started alongside their group
                    // Note: tasks and groups are locked for update, preventing concurrent queries
                    // to dequeue the same tasks and/or groups
                    .with('candidates', (qb) => {
                        qb.select('id', 'group_key', 'created_at', 'group_max_concurrency')
                            .from(TASKS_TABLE)
                            .where('state', 'CREATED')
                            .whereLike('group_key', groupKeyPattern)
                            .where('starts_after', '<=', db.fn.now())
                            .forUpdate()
                            .skipLocked();
                    })
                    // 2. count the number of running tasks for each group
                    .with('running', (qb) => {
                        qb.select(db.raw('count(id) as running_count'), 'group_key')
                            .from(TASKS_TABLE)
                            .where('state', 'STARTED')
                            .whereIn('group_key', function () {
                                this.distinct('group_key').from('candidates');
                            })
                            .groupBy('group_key');
                    })
                    // 3. rank the candidate tasks by created_at for each group
                    .with('with_rank', (qb) => {
                        qb.select(
                            'c.*',
                            db.raw('ROW_NUMBER() OVER (PARTITION BY c.group_key ORDER BY c.created_at ASC) as rank'),
                            db.raw('COALESCE(r.running_count, 0) as current_running')
                        )
                            .from('candidates as c')
                            .leftJoin('running as r', 'c.group_key', 'r.group_key');
                    })
                    // 4. select the tasks that can be started based on the max_concurrency
                    .with('to_start', (qb) => {
                        qb.select('id', 'group_key', 'created_at')
                            .from('with_rank')
                            .whereRaw('group_max_concurrency = 0 OR (rank + current_running <= group_max_concurrency)')

                            .orderBy('created_at', 'asc')
                            .limit(limit);
                    })
                    // 5. starts the tasks
                    .with(
                        'updated_tasks',
                        db
                            .from<DBTask>(TASKS_TABLE)
                            .update({
                                state: 'STARTED',
                                last_heartbeat_at: new Date(),
                                last_state_transition_at: new Date()
                            })
                            .whereIn('id', db.select('id').from('to_start'))
                            .returning('*')
                    )
                    // 6. return the updated tasks
                    .select('*')
                    .from<DBTask>('updated_tasks')
                    .orderBy('id')
            );
        });

        if (!tasks?.[0]) {
            return Ok([]);
        }
        return Ok(tasks.map(DbTask.from));
    } catch (err) {
        return Err(new Error(`Error dequeuing tasks for group key '${groupKey}': ${stringifyError(err)}`));
    }
}

export async function expiresIfTimeout(db: knex.Knex): Promise<Result<Task[]>> {
    try {
        const { rows: tasks } = await db.raw<{ rows: DBTask[] }>(
            `
            WITH eligible_tasks AS (
                SELECT id, state, output,
                    CASE
                        WHEN state = 'CREATED' AND starts_after + created_to_started_timeout_secs * INTERVAL '1 second' < CURRENT_TIMESTAMP
                            THEN '{"reason": "createdToStartedTimeoutSecs_exceeded"}'::json
                        WHEN state = 'STARTED' AND last_heartbeat_at + heartbeat_timeout_secs * INTERVAL '1 second' < CURRENT_TIMESTAMP
                            THEN '{"reason": "heartbeatTimeoutSecs_exceeded"}'::json
                        WHEN state = 'STARTED' AND last_state_transition_at + started_to_completed_timeout_secs * INTERVAL '1 second' < CURRENT_TIMESTAMP
                            THEN '{"reason": "startedToCompletedTimeoutSecs_exceeded"}'::json
                        ELSE output
                    END AS reason
                FROM ${TASKS_TABLE}
                WHERE (
                   state = 'CREATED' AND starts_after + created_to_started_timeout_secs * INTERVAL '1 second' < CURRENT_TIMESTAMP)
                   OR (
                       state = 'STARTED'
                       AND (
                           last_heartbeat_at + heartbeat_timeout_secs * INTERVAL '1 second' < CURRENT_TIMESTAMP
                           OR last_state_transition_at + started_to_completed_timeout_secs * INTERVAL '1 second' < CURRENT_TIMESTAMP
                       )
                    )
                FOR UPDATE SKIP LOCKED
            )
            UPDATE ${TASKS_TABLE} t
            SET state = 'EXPIRED',
                last_state_transition_at = CURRENT_TIMESTAMP,
                terminated = TRUE,
                output = e.reason
            FROM eligible_tasks e
            WHERE t.id = e.id
            RETURNING t.*;
        `
        );
        if (!tasks?.[0]) {
            return Ok([]);
        }
        return Ok(tasks.map(DbTask.from));
    } catch (err) {
        return Err(new Error(`Error expiring tasks: ${stringifyError(err)}`));
    }
}

export async function hardDeleteOlderThanNDays(db: knex.Knex, days: number): Promise<Result<Task[]>> {
    try {
        // Delete terminated tasks where lastStateTransitionAt is older than N days
        // unless it is the most recent task for an given schedule
        const tasks = await db
            .from<DBTask>(TASKS_TABLE)
            .where(
                'id',
                '=',
                // schedules.id is null if the task is not associated with a schedule (ie: actions)
                // or if the task is not the last task for its associated schedule
                db.raw(`ANY(ARRAY(
                    SELECT ${TASKS_TABLE}.id
                    FROM ${TASKS_TABLE}
                    LEFT JOIN ${SCHEDULES_TABLE} ON ${SCHEDULES_TABLE}.last_scheduled_task_id = ${TASKS_TABLE}.id
                    WHERE ${TASKS_TABLE}.terminated = true
                    AND ${TASKS_TABLE}.starts_after < NOW() - INTERVAL '${days} days'
                    AND ${SCHEDULES_TABLE}.id IS NULL
                    ORDER BY ${TASKS_TABLE}.id ASC
                    LIMIT 1000
                  ))`)
            )
            .del()
            .returning('*');
        if (!tasks?.[0]) {
            return Ok([]);
        }
        return Ok(tasks.map(DbTask.from));
    } catch (err) {
        return Err(new Error(`Error hard deleting tasks older than ${days} days: ${stringifyError(err)}`));
    }
}
