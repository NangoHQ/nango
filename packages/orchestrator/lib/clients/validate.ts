import { z } from 'zod';

import { taskStates } from '@nangohq/scheduler';
import { Err, Ok } from '@nangohq/utils';

import { TaskAbort, TaskAction, TaskOnEvent, TaskSync, TaskSyncAbort, TaskWebhook } from './types.js';
import { jsonSchema } from '../utils/validation.js';

import type { OrchestratorSchedule, OrchestratorTask } from './types.js';
import type { Schedule, Task } from '@nangohq/scheduler';
import type { Result } from '@nangohq/utils';

export const commonSchemaArgsFields = {
    connection: z.object({
        id: z.number().positive(),
        connection_id: z.string().min(1),
        provider_config_key: z.string().min(1),
        environment_id: z.number().positive()
    })
};

export const abortArgsSchema = z.object({
    type: z.literal('abort'),
    abortedTask: z.object({
        id: z.string().uuid(),
        state: z.enum(taskStates)
    }),
    reason: z.string().min(1),
    ...commonSchemaArgsFields
});

export const syncArgsSchema = z.object({
    type: z.literal('sync'),
    syncId: z.string().min(1),
    syncName: z.string().min(1),
    syncVariant: z.string().min(1).optional().default('base'), // TODO: remove optional/default
    debug: z.boolean(),
    ...commonSchemaArgsFields
});

export const syncAbortArgsSchema = z
    .object({
        syncId: z.string().min(1),
        syncName: z.string().min(1),
        syncVariant: z.string().min(1).optional().default('base'), // TODO: remove optional/default
        debug: z.boolean()
    })
    .merge(abortArgsSchema);

export const actionArgsSchema = z.object({
    type: z.literal('action'),
    actionName: z.string().min(1),
    activityLogId: z.string(),
    input: jsonSchema,
    async: z.boolean().optional().default(false),
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
    sdkVersion: z.string().nullable(),
    activityLogId: z.string(),
    ...commonSchemaArgsFields
});

const commonSchemaFields = {
    id: z.string().uuid(),
    name: z.string().min(1),
    groupKey: z.string().min(1),
    groupMaxConcurrency: z.number().int().min(0).default(0),
    state: z.enum(taskStates),
    retryKey: z.string().min(1).nullable(),
    retryCount: z.number().int(),
    retryMax: z.number().int(),
    ownerKey: z.string().min(1).nullable(),
    heartbeatTimeoutSecs: z.number().min(1).default(60)
};
const abortSchema = z.object({
    ...commonSchemaFields,
    payload: abortArgsSchema
});
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
                attemptMax: sync.data.retryMax + 1,
                syncId: sync.data.payload.syncId,
                syncName: sync.data.payload.syncName,
                syncVariant: sync.data.payload.syncVariant,
                connection: sync.data.payload.connection,
                groupKey: sync.data.groupKey,
                groupMaxConcurrency: sync.data.groupMaxConcurrency,
                retryKey: sync.data.retryKey,
                ownerKey: sync.data.ownerKey,
                debug: sync.data.payload.debug,
                heartbeatTimeoutSecs: sync.data.heartbeatTimeoutSecs
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
                attemptMax: syncAbort.data.retryMax + 1,
                syncId: syncAbort.data.payload.syncId,
                syncName: syncAbort.data.payload.syncName,
                syncVariant: syncAbort.data.payload.syncVariant,
                connection: syncAbort.data.payload.connection,
                groupKey: syncAbort.data.groupKey,
                groupMaxConcurrency: syncAbort.data.groupMaxConcurrency,
                ownerKey: syncAbort.data.ownerKey,
                retryKey: syncAbort.data.retryKey,
                reason: syncAbort.data.payload.reason,
                debug: syncAbort.data.payload.debug,
                heartbeatTimeoutSecs: syncAbort.data.heartbeatTimeoutSecs
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
                attemptMax: action.data.retryMax + 1,
                actionName: action.data.payload.actionName,
                connection: action.data.payload.connection,
                activityLogId: action.data.payload.activityLogId,
                groupKey: action.data.groupKey,
                groupMaxConcurrency: action.data.groupMaxConcurrency,
                ownerKey: action.data.ownerKey,
                retryKey: action.data.retryKey,
                input: action.data.payload.input,
                async: action.data.payload.async,
                heartbeatTimeoutSecs: action.data.heartbeatTimeoutSecs
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
                attemptMax: webhook.data.retryMax + 1,
                webhookName: webhook.data.payload.webhookName,
                parentSyncName: webhook.data.payload.parentSyncName,
                connection: webhook.data.payload.connection,
                activityLogId: webhook.data.payload.activityLogId,
                groupKey: webhook.data.groupKey,
                groupMaxConcurrency: webhook.data.groupMaxConcurrency,
                ownerKey: webhook.data.ownerKey,
                retryKey: webhook.data.retryKey,
                input: webhook.data.payload.input,
                heartbeatTimeoutSecs: webhook.data.heartbeatTimeoutSecs
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
                attemptMax: onEvent.data.retryMax + 1,
                onEventName: onEvent.data.payload.onEventName,
                version: onEvent.data.payload.version,
                connection: onEvent.data.payload.connection,
                groupKey: onEvent.data.groupKey,
                groupMaxConcurrency: onEvent.data.groupMaxConcurrency,
                ownerKey: onEvent.data.ownerKey,
                retryKey: onEvent.data.retryKey,
                fileLocation: onEvent.data.payload.fileLocation,
                sdkVersion: onEvent.data.payload.sdkVersion,
                activityLogId: onEvent.data.payload.activityLogId,
                heartbeatTimeoutSecs: onEvent.data.heartbeatTimeoutSecs
            })
        );
    }
    const abort = abortSchema.safeParse(task);
    if (abort.success) {
        return Ok(
            TaskAbort({
                id: abort.data.id,
                abortedTask: abort.data.payload.abortedTask,
                state: abort.data.state,
                name: abort.data.name,
                attempt: abort.data.retryCount + 1,
                attemptMax: abort.data.retryMax + 1,
                connection: abort.data.payload.connection,
                groupKey: abort.data.groupKey,
                groupMaxConcurrency: abort.data.groupMaxConcurrency,
                ownerKey: abort.data.ownerKey,
                retryKey: abort.data.retryKey,
                reason: abort.data.payload.reason,
                heartbeatTimeoutSecs: abort.data.heartbeatTimeoutSecs
            })
        );
    }
    return Err(`Cannot validate task ${JSON.stringify(task)}`);
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
    return Err(new Error('Cannot validate schedule', { cause: { err: validation.error, context: schedule } }));
}
