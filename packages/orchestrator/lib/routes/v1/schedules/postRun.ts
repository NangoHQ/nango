import { z } from 'zod';
import type { Scheduler } from '@nangohq/scheduler';
import type { ApiError, Endpoint } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, RouteHandler, Route } from '@nangohq/utils';
import { validateRequest } from '@nangohq/utils';

const path = '/v1/schedules/run';
const method = 'POST';

export type PostScheduleRun = Endpoint<{
    Method: typeof method;
    Path: typeof path;
    Body: {
        scheduleName: string;
    };
    Error: ApiError<'recurring_run_failed'>;
    Success: { scheduleId: string };
}>;

const validate = validateRequest<PostScheduleRun>({
    parseBody: (data: any) => {
        return z
            .object({ scheduleName: z.string().min(1) })
            .strict()
            .parse(data);
    }
});

const handler = (scheduler: Scheduler) => {
    return async (req: EndpointRequest<PostScheduleRun>, res: EndpointResponse<PostScheduleRun>) => {
        const schedule = await scheduler.immediate({
            scheduleName: req.body.scheduleName
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
