import { z } from 'zod';

import { validateRequest } from '@nangohq/utils';

import { syncArgsSchema } from '../../clients/validate.js';

import type { TaskType } from '../../types.js';
import type { Scheduler } from '@nangohq/scheduler';
import type { ApiError, Endpoint } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, Route, RouteHandler } from '@nangohq/utils';
import type { JsonValue } from 'type-fest';

const path = '/v1/recurring';
const method = 'POST';

export type PostRecurring = Endpoint<{
    Method: typeof method;
    Path: typeof path;
    Body: {
        name: string;
        state: 'STARTED' | 'PAUSED';
        startsAt: Date;
        frequencyMs: number;
        group: {
            key: string;
            maxConcurrency: number;
        };
        retry: {
            max: number;
        };
        timeoutSettingsInSecs: {
            createdToStarted: number;
            startedToCompleted: number;
            heartbeat: number;
        };
        args: JsonValue & { type: TaskType };
    };
    Error: ApiError<'recurring_failed'>;
    Success: { scheduleId: string };
}>;

const validate = validateRequest<PostRecurring>({
    parseBody: (data: any) => {
        const schema = z
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
                args: syncArgsSchema
            })
            .strict();
        return z
            .preprocess((d) => {
                // for backwards compatibility
                if (d && typeof d === 'object' && 'groupKey' in d) {
                    const { groupKey, ...rest } = d;
                    return { ...rest, group: { key: groupKey, maxConcurrency: 0 } };
                }
                return d;
            }, schema)
            .parse(data);
    }
});

const handler = (scheduler: Scheduler) => {
    return async (_req: EndpointRequest, res: EndpointResponse<PostRecurring>) => {
        const schedule = await scheduler.recurring({
            name: res.locals.body.name,
            state: res.locals.body.state,
            payload: res.locals.body.args,
            startsAt: res.locals.body.startsAt,
            frequencyMs: res.locals.body.frequencyMs,
            groupKey: res.locals.body.group.key,
            groupKeyMaxConcurrency: res.locals.body.group.maxConcurrency,
            retryMax: res.locals.body.retry.max,
            createdToStartedTimeoutSecs: res.locals.body.timeoutSettingsInSecs.createdToStarted,
            startedToCompletedTimeoutSecs: res.locals.body.timeoutSettingsInSecs.startedToCompleted,
            heartbeatTimeoutSecs: res.locals.body.timeoutSettingsInSecs.heartbeat,
            lastScheduledTaskId: null
        });
        if (schedule.isErr()) {
            res.status(500).json({ error: { code: 'recurring_failed', message: schedule.error.message } });
            return;
        }
        res.status(200).json({ scheduleId: schedule.value.id });
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
