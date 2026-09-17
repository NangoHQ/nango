import * as z from 'zod';

import { validateRequest } from '@nangohq/utils';

import { scheduleFunctionArgsSchema, syncArgsSchema } from '../../clients/validate.js';

import type { Scheduler } from '@nangohq/scheduler';
import type { ApiError, Endpoint } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, Route, RouteHandler } from '@nangohq/utils';
import type { JsonObject } from 'type-fest';

const path = '/v1/recurring';
const method = 'POST';
const recurringArgsSchema = z.discriminatedUnion('type', [syncArgsSchema, scheduleFunctionArgsSchema]);

export const MAX_RECURRING_BATCH_SIZE = 1000;

export type RecurringEntry = {
    name: string;
    state: 'STARTED' | 'PAUSED';
    startsAt: Date;
    frequencyMs: number;
    group: { key: string; maxConcurrency: number };
    retry: { max: number };
    timeoutSettingsInSecs: { createdToStarted: number; startedToCompleted: number; heartbeat: number };
    args: z.input<typeof recurringArgsSchema>;
};

export type PostRecurring = Endpoint<{
    Method: typeof method;
    Path: typeof path;
    Body: RecurringEntry | RecurringEntry[];
    Error: ApiError<'recurring_failed'>;
    Success: { scheduleId: string } | { scheduleIds: string[] };
}>;

export const recurringSchema = z
    .object({
        name: z.string().min(1),
        state: z.enum(['STARTED', 'PAUSED']),
        startsAt: z.coerce.date(),
        frequencyMs: z.number().int().positive(),
        group: z.object({
            key: z.string().min(1),
            maxConcurrency: z.coerce.number()
        }),
        retry: z.object({
            max: z.number().int()
        }),
        timeoutSettingsInSecs: z.object({
            createdToStarted: z.number().int().positive(),
            startedToCompleted: z.number().int().positive(),
            heartbeat: z.number().int().positive()
        }),
        args: recurringArgsSchema
    })
    .strict();

const bodySchema = z.preprocess((d) => {
    // for backwards compatibility
    if (d && typeof d === 'object' && 'groupKey' in d) {
        const { groupKey, ...rest } = d;
        return { ...rest, group: { key: groupKey, maxConcurrency: 0 } };
    }
    return d;
}, recurringSchema);

const validate = validateRequest<PostRecurring>({
    parseBody: (data: unknown) =>
        z
            .union([
                bodySchema,
                z
                    .array(bodySchema)
                    .min(1)
                    .max(MAX_RECURRING_BATCH_SIZE)
                    .refine((entries) => new Set(entries.map((entry) => entry.name)).size === entries.length, 'Duplicate schedule names within batch')
            ])
            .parse(data)
});

const handler = (scheduler: Scheduler) => {
    return async (_req: EndpointRequest, res: EndpointResponse<PostRecurring>) => {
        const body = res.locals.parsedBody;
        const entries = Array.isArray(body) ? body : [body];
        const schedules = await scheduler.recurring(
            entries.map((entry) => ({
                name: entry.name,
                state: entry.state,
                payload: entry.args as JsonObject,
                startsAt: entry.startsAt,
                frequencyMs: entry.frequencyMs,
                groupKey: entry.group.key,
                retryMax: entry.retry.max,
                createdToStartedTimeoutSecs: entry.timeoutSettingsInSecs.createdToStarted,
                startedToCompletedTimeoutSecs: entry.timeoutSettingsInSecs.startedToCompleted,
                heartbeatTimeoutSecs: entry.timeoutSettingsInSecs.heartbeat,
                lastScheduledTaskId: null,
                lastScheduledTaskState: null
            }))
        );
        if (schedules.isErr()) {
            res.status(500).json({ error: { code: 'recurring_failed', message: schedules.error.message } });
            return;
        }
        const scheduleIds = schedules.value.map((schedule) => schedule.id);
        res.status(200).json(Array.isArray(body) ? { scheduleIds } : { scheduleId: scheduleIds[0]! });
        return;
    };
};

export const route: Route<PostRecurring> = { path, method };

export const routeHandler = (scheduler: Scheduler): RouteHandler<PostRecurring> => {
    return {
        ...route,
        validate,
        handler: handler(scheduler)
    };
};
