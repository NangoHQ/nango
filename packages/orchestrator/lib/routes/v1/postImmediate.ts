import * as z from 'zod';

import { isDuplicateTaskNameError } from '@nangohq/scheduler';
import { validateRequest } from '@nangohq/utils';

import { actionArgsSchema, onEventArgsSchema, syncAbortArgsSchema, syncArgsSchema, webhookArgsSchema } from '../../clients/validate.js';

import type { TaskType } from '../../types.js';
import type { WebhookAdmission, WebhookAdmissionError } from '../../webhook-admission.js';
import type { Scheduler } from '@nangohq/scheduler';
import type { ApiError, Endpoint } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, Route, RouteHandler } from '@nangohq/utils';
import type { JsonObject } from 'type-fest';

const path = '/v1/immediate';
const method = 'POST';

export interface ImmediateSuccess {
    taskId: string;
    retryKey: string;
}

export const immediateTaskSchema = z
    .object({
        name: z.string().min(1),
        ownerKey: z.string().optional().default(''), // for backwards compatibility. TODO: replace with z.string() once all callers are updated
        group: z.object({
            key: z.string().min(1),
            maxConcurrency: z.coerce.number()
        }),
        retry: z.object({
            count: z.number().int(),
            max: z.number().int()
        }),
        timeoutSettingsInSecs: z.object({
            createdToStarted: z.number().int().positive(),
            startedToCompleted: z.number().int().positive(),
            heartbeat: z.number().int().positive()
        }),
        args: z.discriminatedUnion('type', [syncArgsSchema, actionArgsSchema, webhookArgsSchema, onEventArgsSchema, syncAbortArgsSchema])
    })
    .strict();

export type PostImmediate = Endpoint<{
    Method: typeof method;
    Path: typeof path;
    Body: {
        name: string;
        ownerKey?: string;
        group: {
            key: string;
            maxConcurrency: number;
        };
        retry: {
            count: number;
            max: number;
        };
        timeoutSettingsInSecs: {
            createdToStarted: number;
            startedToCompleted: number;
            heartbeat: number;
        };
        args: JsonObject & { type: TaskType };
    };
    Error: ApiError<'immediate_failed' | 'duplicate_task_name'> | WebhookAdmissionError;
    Success: ImmediateSuccess;
}>;

const validate = validateRequest<PostImmediate>({
    parseBody: (data: any) => {
        return z
            .preprocess((o) => {
                // for backwards compatibility
                if (o && typeof o === 'object' && 'groupKey' in o) {
                    const { groupKey, ...rest } = o;
                    return { ...rest, group: { key: groupKey, maxConcurrency: 0 } };
                }
                return o;
            }, immediateTaskSchema)
            .parse(data);
    }
});

const handler = (scheduler: Scheduler, webhookAdmission: WebhookAdmission) => {
    return async (_req: EndpointRequest, res: EndpointResponse<PostImmediate>) => {
        const admission = res.locals.parsedBody.args.type === 'webhook' ? webhookAdmission.acquire() : undefined;
        if (admission && !admission.acquired) {
            res.status(529).json({
                error: {
                    message: 'Webhook admission capacity is temporarily exhausted',
                    payload: admission
                }
            });
            return;
        }
        const permit = admission?.acquired ? admission : undefined;
        try {
            const task = await scheduler.immediate({
                name: res.locals.parsedBody.name,
                payload: res.locals.parsedBody.args,
                groupKey: res.locals.parsedBody.group.key,
                groupMaxConcurrency: res.locals.parsedBody.group.maxConcurrency,
                retryMax: res.locals.parsedBody.retry.max,
                retryCount: res.locals.parsedBody.retry.count,
                ownerKey: res.locals.parsedBody.ownerKey || null,
                createdToStartedTimeoutSecs: res.locals.parsedBody.timeoutSettingsInSecs.createdToStarted,
                startedToCompletedTimeoutSecs: res.locals.parsedBody.timeoutSettingsInSecs.startedToCompleted,
                heartbeatTimeoutSecs: res.locals.parsedBody.timeoutSettingsInSecs.heartbeat
            });
            if (task.isErr()) {
                if (isDuplicateTaskNameError(task.error)) {
                    res.status(409).json({
                        error: {
                            code: 'duplicate_task_name',
                            message: task.error.message
                        }
                    });
                    return;
                }

                res.status(500).json({ error: { code: 'immediate_failed', message: task.error.message } });
                return;
            }

            res.status(200).json({ taskId: task.value.id, retryKey: task.value.retryKey! });
            return;
        } finally {
            permit?.release();
        }
    };
};

export const route: Route<PostImmediate> = { path, method };

export const routeHandler = (scheduler: Scheduler, webhookAdmission: WebhookAdmission): RouteHandler<PostImmediate> => {
    return {
        ...route,
        validate,
        handler: handler(scheduler, webhookAdmission)
    };
};
