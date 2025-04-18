import { z } from 'zod';
import type { JsonValue } from 'type-fest';
import type { Scheduler } from '@nangohq/scheduler';
import type { ApiError, Endpoint } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, RouteHandler, Route } from '@nangohq/utils';
import { validateRequest } from '@nangohq/utils';
import { syncArgsSchema } from '../../clients/validate.js';
import type { TaskType } from '../../types.js';

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
        groupKey: string;
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
        return z
            .object({
                name: z.string().min(1),
                state: z.enum(['STARTED', 'PAUSED']),
                startsAt: z.coerce.date(),
                frequencyMs: z.number().int().positive(),
                groupKey: z.string().min(1),
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
            .strict()
            .parse(data);
    }
});

const handler = (scheduler: Scheduler) => {
    return async (req: EndpointRequest<PostRecurring>, res: EndpointResponse<PostRecurring>) => {
        const schedule = await scheduler.recurring({
            name: req.body.name,
            state: req.body.state,
            payload: req.body.args,
            startsAt: req.body.startsAt,
            frequencyMs: req.body.frequencyMs,
            groupKey: req.body.groupKey,
            retryMax: req.body.retry.max,
            createdToStartedTimeoutSecs: req.body.timeoutSettingsInSecs.createdToStarted,
            startedToCompletedTimeoutSecs: req.body.timeoutSettingsInSecs.startedToCompleted,
            heartbeatTimeoutSecs: req.body.timeoutSettingsInSecs.heartbeat,
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
