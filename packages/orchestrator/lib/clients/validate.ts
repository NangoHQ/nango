import { taskStates } from '@nangohq/scheduler';
import type { Schedule, Task } from '@nangohq/scheduler';
import type { OrchestratorSchedule, OrchestratorTask } from './types.js';
import { TaskAction, TaskWebhook, TaskOnEvent, TaskSync, TaskSyncAbort } from './types.js';
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

export const syncAbortArgsSchema = z.object({
    type: z.literal('abort'),
    abortedTask: z.object({
        id: z.string().uuid(),
        state: z.enum(taskStates)
    }),
    reason: z.string().min(1),
    syncId: z.string().min(1),
    syncName: z.string().min(1),
    debug: z.boolean(),
    ...commonSchemaArgsFields
});

export const actionArgsSchema = z.object({
    type: z.literal('action'),
    actionName: z.string().min(1),
    activityLogId: z.string(),
    input: jsonSchema,
    ...commonSchemaArgsFields
});
export const webhookArgsSchema = z.object({
    type: z.literal('webhook'),
    webhookName: z.string().min(1),
    parentSyncName: z.string().min(1),
    activityLogId: z.string(),
    input: jsonSchema,
    ...commonSchemaArgsFields
});
export const onEventArgsSchema = z.object({
    type: z.literal('on-event'),
    onEventName: z.string().min(1),
    version: z.string().min(1),
    fileLocation: z.string().min(1),
    activityLogId: z.string(),
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
const syncAbortchema = z.object({
    ...commonSchemaFields,
    payload: syncAbortArgsSchema
});
const actionSchema = z.object({
    ...commonSchemaFields,
    payload: actionArgsSchema
});
const webhookSchema = z.object({
    ...commonSchemaFields,
    payload: webhookArgsSchema
});
const onEventSchema = z.object({
    ...commonSchemaFields,
    payload: onEventArgsSchema
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
                groupKey: sync.data.groupKey,
                debug: sync.data.payload.debug
            })
        );
    }
    const syncAbort = syncAbortchema.safeParse(task);
    if (syncAbort.success) {
        return Ok(
            TaskSyncAbort({
                id: syncAbort.data.id,
                abortedTask: syncAbort.data.payload.abortedTask,
                state: syncAbort.data.state,
                name: syncAbort.data.name,
                attempt: syncAbort.data.retryCount + 1,
                syncId: syncAbort.data.payload.syncId,
                syncName: syncAbort.data.payload.syncName,
                connection: syncAbort.data.payload.connection,
                groupKey: syncAbort.data.groupKey,
                reason: syncAbort.data.payload.reason,
                debug: syncAbort.data.payload.debug
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
                groupKey: action.data.groupKey,
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
                groupKey: webhook.data.groupKey,
                input: webhook.data.payload.input
            })
        );
    }
    const onEvent = onEventSchema.safeParse(task);
    if (onEvent.success) {
        return Ok(
            TaskOnEvent({
                id: onEvent.data.id,
                state: onEvent.data.state,
                name: onEvent.data.name,
                attempt: onEvent.data.retryCount + 1,
                onEventName: onEvent.data.payload.onEventName,
                version: onEvent.data.payload.version,
                connection: onEvent.data.payload.connection,
                groupKey: onEvent.data.groupKey,
                fileLocation: onEvent.data.payload.fileLocation,
                activityLogId: onEvent.data.payload.activityLogId
            })
        );
    }
    return Err(
        `Cannot validate task ${JSON.stringify(task)}: ${stringifyError(sync.error || action.error || webhook.error || onEvent.error || syncAbort.error)}`
    );
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
            deletedAt: z.coerce.date().nullable(),
            lastScheduledTaskId: z.string().uuid().nullable()
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
            nextDueDate: validation.data.state == 'STARTED' ? getNextDueDate(validation.data.startsAt, validation.data.frequencyMs) : null
        };
        return Ok(schedule);
    }
    return Err(new Error('Cannot validate task', { cause: { err: validation.error, context: schedule } }));
}
