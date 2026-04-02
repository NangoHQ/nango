import * as z from 'zod';

import { validateRequest } from '@nangohq/utils';

import type { Schedule, ScheduleState, Scheduler } from '@nangohq/scheduler';
import type { ApiError, Endpoint } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, Route, RouteHandler } from '@nangohq/utils';

const path = '/v1/schedules/search';
const method = 'POST';

type PostSearch = Endpoint<{
    Method: typeof method;
    Path: typeof path;
    Body: {
        names?: string[] | undefined;
        state?: ScheduleState | undefined;
        limit: number;
    };
    Error: ApiError<'search_failed'>;
    Success: Schedule[];
}>;

const bodySchema = z
    .object({
        // max = page size (20 connections) * (~25 assumed schedules per connection) * 2 as buffer
        names: z.array(z.string().min(1)).max(1000).optional(),
        state: z.enum(['STARTED', 'PAUSED', 'DELETED'] satisfies ScheduleState[]).optional(),
        limit: z.number().int()
    })
    .strict();

const validate = validateRequest<PostSearch>({
    parseBody: (data) => bodySchema.parse(data)
});

const handler = (scheduler: Scheduler) => {
    return async (_req: EndpointRequest, res: EndpointResponse<PostSearch>) => {
        const { names, state, limit } = res.locals.parsedBody;
        const getSchedules = await scheduler.searchSchedules({
            limit,
            ...(names ? { names } : {}),
            ...(state ? { state } : {})
        });
        if (getSchedules.isErr()) {
            res.status(500).json({ error: { code: 'search_failed', message: getSchedules.error.message } });
            return;
        }
        res.status(200).json(getSchedules.value);
        return;
    };
};

export const route: Route<PostSearch> = { path, method };

export const routeHandler = (scheduler: Scheduler): RouteHandler<PostSearch> => {
    return {
        ...route,
        validate,
        handler: handler(scheduler)
    };
};
