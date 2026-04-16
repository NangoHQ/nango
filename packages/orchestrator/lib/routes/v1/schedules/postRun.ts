import * as z from 'zod';

import { validateRequest } from '@nangohq/utils';

import type { Scheduler } from '@nangohq/scheduler';
import type { ApiError, Endpoint } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, Route, RouteHandler } from '@nangohq/utils';

const path = '/v1/schedules/run';
const method = 'POST';

const bodySchema = z
    .object({
        scheduleName: z.string().min(1),
        operationId: z
            .string()
            .regex(/^[a-zA-Z0-9_]{20,25}$/)
            .optional()
    })
    .strict();

export type PostScheduleRun = Endpoint<{
    Method: typeof method;
    Path: typeof path;
    Body: z.output<typeof bodySchema>;
    Error: ApiError<'recurring_run_failed'>;
    Success: { scheduleId: string };
}>;

const validate = validateRequest<PostScheduleRun>({
    parseBody: (data) => bodySchema.parse(data)
});

const handler = (scheduler: Scheduler) => {
    return async (_req: EndpointRequest, res: EndpointResponse<PostScheduleRun>) => {
        const { scheduleName, operationId } = res.locals.parsedBody;
        const schedule = await scheduler.immediate({
            scheduleName,
            ...(operationId !== undefined ? { payloadOverride: { operationId } } : {})
        });
        if (schedule.isErr()) {
            res.status(500).json({ error: { code: 'recurring_run_failed', message: schedule.error.message } });
            return;
        }
        res.status(200).json({ scheduleId: schedule.value.id });
        return;
    };
};

export const route: Route<PostScheduleRun> = { path, method };

export const routeHandler = (scheduler: Scheduler): RouteHandler<PostScheduleRun> => {
    return {
        ...route,
        validate,
        handler: handler(scheduler)
    };
};
