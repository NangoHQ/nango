import { taskStates } from '@nangohq/scheduler';
import type { Schedule, Task } from '@nangohq/scheduler';
import type { OrchestratorSchedule, OrchestratorTask } from './types.js';
import { TaskAction, TaskWebhook, TaskPostConnection, TaskSync } from './types.js';
import { z } from 'zod';
import { Err, Ok, stringifyError } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';
import { jsonSchema } from '../utils/validation.js';

export const commonSchemaArgsFields = {
    connection: z.object({
        id: z.number().positive(),
        connection_id: z.string().min(1),
        provider_config_key: z.string().min(1),
        environment_id: z.number().positive()
    })
};

export const syncArgsSchema = z.object({
    type: z.literal('sync'),
    syncId: z.string().min(1),
    syncName: z.string().min(1),
    debug: z.boolean(),
    ...commonSchemaArgsFields
});

export const actionArgsSchema = z.object({
    type: z.literal('action'),
    actionName: z.string().min(1),
    activityLogId: z.number().positive(),
    input: jsonSchema,
    ...commonSchemaArgsFields
});
export const webhookArgsSchema = z.object({
    type: z.literal('webhook'),
    webhookName: z.string().min(1),
    parentSyncName: z.string().min(1),
    activityLogId: z.number().positive(),
    input: jsonSchema,
    ...commonSchemaArgsFields
});
export const postConnectionArgsSchema = z.object({
    type: z.literal('post-connection-script'),
    postConnectionName: z.string().min(1),
    fileLocation: z.string().min(1),
    activityLogId: z.number().positive(),
    ...commonSchemaArgsFields
});

const commonSchemaFields = {
    id: z.string().uuid(),
    name: z.string().min(1),
    groupKey: z.string().min(1),
    state: z.enum(taskStates),
    retryCount: z.number().int()
};
const syncSchema = z.object({
    ...commonSchemaFields,
    payload: syncArgsSchema
});
const actionSchema = z.object({
    ...commonSchemaFields,
    payload: actionArgsSchema
});
const webhookSchema = z.object({
    ...commonSchemaFields,
    payload: webhookArgsSchema
});
const postConnectionSchema = z.object({
    ...commonSchemaFields,
    payload: postConnectionArgsSchema
});

export function validateTask(task: Task): Result<OrchestratorTask> {
    const sync = syncSchema.safeParse(task);
    if (sync.success) {
        return Ok(
            TaskSync({
                id: sync.data.id,
                state: sync.data.state,
                name: sync.data.name,
                attempt: sync.data.retryCount + 1,
                syncId: sync.data.payload.syncId,
                syncName: sync.data.payload.syncName,
                connection: sync.data.payload.connection,
                debug: sync.data.payload.debug
            })
        );
    }
    const action = actionSchema.safeParse(task);
    if (action.success) {
        return Ok(
            TaskAction({
                state: action.data.state,
                id: action.data.id,
                name: action.data.name,
                attempt: action.data.retryCount + 1,
                actionName: action.data.payload.actionName,
                connection: action.data.payload.connection,
                activityLogId: action.data.payload.activityLogId,
                input: action.data.payload.input
            })
        );
    }
    const webhook = webhookSchema.safeParse(task);
    if (webhook.success) {
        return Ok(
            TaskWebhook({
                id: webhook.data.id,
                state: webhook.data.state,
                name: webhook.data.name,
                attempt: webhook.data.retryCount + 1,
                webhookName: webhook.data.payload.webhookName,
                parentSyncName: webhook.data.payload.parentSyncName,
                connection: webhook.data.payload.connection,
                activityLogId: webhook.data.payload.activityLogId,
                input: webhook.data.payload.input
            })
        );
    }
    const postConnection = postConnectionSchema.safeParse(task);
    if (postConnection.success) {
        return Ok(
            TaskPostConnection({
                id: postConnection.data.id,
                state: postConnection.data.state,
                name: postConnection.data.name,
                attempt: postConnection.data.retryCount + 1,
                postConnectionName: postConnection.data.payload.postConnectionName,
                connection: postConnection.data.payload.connection,
                fileLocation: postConnection.data.payload.fileLocation,
                activityLogId: postConnection.data.payload.activityLogId
            })
        );
    }
    return Err(`Cannot validate task ${JSON.stringify(task)}: ${stringifyError(sync.error || action.error || webhook.error || postConnection.error)}`);
}

export function validateSchedule(schedule: Schedule): Result<OrchestratorSchedule> {
    const scheduleSchema = z
        .object({
            id: z.string().uuid(),
            name: z.string().min(1),
            state: z.enum(['STARTED', 'PAUSED', 'DELETED']),
            startsAt: z.coerce.date(),
            frequencyMs: z.number().int().positive(),
            payload: jsonSchema,
            groupKey: z.string().min(1),
            retryMax: z.number().int(),
            createdToStartedTimeoutSecs: z.number().int(),
            startedToCompletedTimeoutSecs: z.number().int(),
            heartbeatTimeoutSecs: z.number().int(),
            createdAt: z.coerce.date(),
            updatedAt: z.coerce.date(),
            deletedAt: z.coerce.date().nullable()
        })
        .strict();
    const getNextDueDate = (startsAt: Date, frequencyMs: number) => {
        const now = new Date();
        const startDate = new Date(startsAt);
        if (startDate >= now) {
            return startDate;
        }
        const timeDiff = now.getTime() - startDate.getTime();
        const nextDueDate = new Date(now.getTime() + frequencyMs - (timeDiff % frequencyMs));

        return nextDueDate;
    };
    const validation = scheduleSchema.safeParse(schedule);
    if (validation.success) {
        const schedule: OrchestratorSchedule = {
            id: validation.data.id,
            name: validation.data.name,
            state: validation.data.state,
            frequencyMs: validation.data.frequencyMs,
            nextDueDate: getNextDueDate(validation.data.startsAt, validation.data.frequencyMs)
        };
        return Ok(schedule);
    }
    return Err(`Cannot validate task ${JSON.stringify(schedule)}: ${validation.error}`);
}
