import type { Result } from '@nangohq/utils';
import { Ok, Err, stringifyError } from '@nangohq/utils';
import { db } from '../db/client.js';
import type { JsonObject, TaskState, Task } from '../types.js';
import { uuidv7 } from 'uuidv7';

export const TASKS_TABLE = 'tasks';

export type TaskProps = Omit<Task, 'id' | 'createdAt' | 'state' | 'lastStateTransitionAt' | 'lastHeartbeatAt' | 'output' | 'terminated'>;

export const taskStates = ['CREATED', 'STARTED', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'CANCELLED'] as const;

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
const terminalStates: TaskState[] = taskStates.filter((state) => {
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

interface DbTask {
    readonly id: string;
    readonly name: string;
    readonly payload: JsonObject;
    readonly group_key: string;
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
    output: JsonObject | null;
    terminated: boolean;
}
const DbTask = {
    to: (task: Task): DbTask => {
        return {
            id: task.id,
            name: task.name,
            payload: task.payload,
            group_key: task.groupKey,
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
            terminated: task.terminated
        };
    },
    from: (dbTask: DbTask): Task => {
        return {
            id: dbTask.id,
            name: dbTask.name,
            payload: dbTask.payload,
            groupKey: dbTask.group_key,
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
            terminated: dbTask.terminated
        };
    }
};

export async function create(taskProps: TaskProps): Promise<Result<Task>> {
    const now = new Date();
    const newTask: Task = {
        ...taskProps,
        id: uuidv7(),
        createdAt: now,
        state: 'CREATED',
        lastStateTransitionAt: now,
        lastHeartbeatAt: now,
        terminated: false,
        output: null
    };
    try {
        const inserted = await db.from<DbTask>(TASKS_TABLE).insert(DbTask.to(newTask)).returning('*');
        if (!inserted?.[0]) {
            return Err(new Error(`Error: no task '${taskProps.name}' created`));
        }
        return Ok(DbTask.from(inserted[0]));
    } catch (err: unknown) {
        return Err(new Error(`Error creating task '${taskProps.name}': ${stringifyError(err)}`));
    }
}

export async function get(taskId: string): Promise<Result<Task>> {
    const task = await db.from<DbTask>(TASKS_TABLE).where('id', taskId).first();
    if (!task) {
        return Err(new Error(`Task with id '${taskId}' not found`));
    }
    return Ok(DbTask.from(task));
}

export async function heartbeat(taskId: string): Promise<Result<Task>> {
    try {
        const updated = await db.from<DbTask>(TASKS_TABLE).where('id', taskId).update({ last_heartbeat_at: new Date() }).returning('*');
        if (!updated?.[0]) {
            return Err(new Error(`Error: Task with id '${taskId}' not updated`));
        }
        return Ok(DbTask.from(updated[0]));
    } catch (err: unknown) {
        return Err(new Error(`Error updating task ${taskId}: ${stringifyError(err)}`));
    }
}

export async function transitionState({ taskId, newState, output }: { taskId: string; newState: TaskState; output?: JsonObject }): Promise<Result<Task>> {
    if (newState === 'SUCCEEDED' && !output) {
        return Err(new Error(`Output is required when state = '${newState}'`));
    }
    const task = await get(taskId);
    if (task.isErr()) {
        return Err(new Error(`Task with id '${taskId}' not found`));
    }

    const transition = TaskStateTransition.validate({ from: task.value.state, to: newState });
    if (transition.isErr()) {
        return Err(transition.error);
    }

    const updated = await db
        .from<DbTask>(TASKS_TABLE)
        .where('id', taskId)
        .update({
            state: transition.value.to,
            last_state_transition_at: new Date(),
            terminated: terminalStates.includes(transition.value.to),
            output: output || null
        })
        .returning('*');
    if (!updated?.[0]) {
        return Err(new Error(`Task with id '${taskId}' not found`));
    }
    return Ok(DbTask.from(updated[0]));
}

export async function dequeue({ groupKey, limit }: { groupKey: string; limit: number }): Promise<Result<Task[]>> {
    try {
        const tasks = await db
            .update({
                state: 'STARTED',
                last_state_transition_at: new Date()
            })
            .from<DbTask>(TASKS_TABLE)
            .whereIn(
                'id',
                db
                    .select('id')
                    .from<DbTask>(TASKS_TABLE)
                    .where({ group_key: groupKey, state: 'CREATED' })
                    .where('starts_after', '<=', db.fn.now())
                    .orderBy('created_at')
                    .limit(limit)
                    .forUpdate()
                    .skipLocked()
            )
            .returning('*');
        if (!tasks?.[0]) {
            return Ok([]);
        }
        // Sort tasks by id (uuidv7) to ensure ordering by creation date
        const sorted = tasks.sort((a, b) => a.id.localeCompare(b.id)).map(DbTask.from);
        return Ok(sorted);
    } catch (err: unknown) {
        return Err(new Error(`Error dequeuing tasks for group key '${groupKey}': ${stringifyError(err)}`));
    }
}

export async function expiresIfTimeout(): Promise<Result<Task[]>> {
    try {
        const tasks = await db
            .update({
                state: 'EXPIRED',
                last_state_transition_at: new Date(),
                terminated: true
            })
            .from<DbTask>(TASKS_TABLE)
            .whereIn(
                'id',
                db
                    .select('id')
                    .from<DbTask>(TASKS_TABLE)
                    .where((builder) => {
                        builder
                            .where({ state: 'CREATED' })
                            .andWhere(db.raw(`starts_after + created_to_started_timeout_secs * INTERVAL '1 seconds' < CURRENT_TIMESTAMP`));
                        builder
                            .orWhere({ state: 'STARTED' })
                            .andWhere(db.raw(`last_heartbeat_at + heartbeat_timeout_secs * INTERVAL '1 seconds' < CURRENT_TIMESTAMP`));
                        builder
                            .orWhere({ state: 'STARTED' })
                            .andWhere(db.raw(`last_state_transition_at + started_to_completed_timeout_secs * INTERVAL '1 seconds' < CURRENT_TIMESTAMP`));
                    })
                    .forUpdate()
                    .skipLocked()
                    .debug(true)
            )
            .returning('*');
        if (!tasks?.[0]) {
            return Ok([]);
        }
        return Ok(tasks.map(DbTask.from));
    } catch (err: unknown) {
        return Err(new Error(`Error expiring tasks: ${stringifyError(err)}`));
    }
}
