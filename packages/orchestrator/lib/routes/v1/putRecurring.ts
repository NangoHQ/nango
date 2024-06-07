import { z } from 'zod';
import type { Scheduler } from '@nangohq/scheduler';
import type { ApiError, Endpoint } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, RouteHandler, Route } from '@nangohq/utils';
import { validateRequest } from '@nangohq/utils';

const path = '/v1/recurring';
const method = 'PUT';

export type PostRecurring = Endpoint<{
    Method: typeof method;
    Path: typeof path;
    Body: {
        scheduleName: string;
        state: 'STARTED' | 'PAUSED' | 'DELETED';
    };
    Error: ApiError<'recurring_failed'>;
    Success: { scheduleId: string };
}>;

const validate = validateRequest<PostRecurring>({
    parseBody: (data: any) => {
        return z
            .object({
                scheduleName: z.string().min(1),
                state: z.enum(['STARTED', 'PAUSED', 'DELETED'])
            })
            .strict()
            .parse(data);
    }
});

const handler = (scheduler: Scheduler) => {
    return async (req: EndpointRequest<PostRecurring>, res: EndpointResponse<PostRecurring>) => {
        const { scheduleName, state } = req.body;
        const schedule = await scheduler.setScheduleState({ scheduleName, state });
        if (schedule.isErr()) {
            return res.status(500).json({ error: { code: 'recurring_failed', message: schedule.error.message } });
        }
        return res.status(201).json({ scheduleId: schedule.value.id });
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
