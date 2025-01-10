import { z } from 'zod';
import type { Scheduler, Schedule } from '@nangohq/scheduler';
import type { ApiError, Endpoint } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, RouteHandler, Route } from '@nangohq/utils';
import { validateRequest } from '@nangohq/utils';

const path = '/v1/schedules/search';
const method = 'POST';

type PostSearch = Endpoint<{
    Method: typeof method;
    Path: typeof path;
    Body: {
        names?: string[] | undefined;
        limit: number;
    };
    Error: ApiError<'search_failed'>;
    Success: Schedule[];
}>;

const validate = validateRequest<PostSearch>({
    parseBody: (data) =>
        z
            .object({
                names: z.array(z.string().min(1)).optional(),
                limit: z.number().int()
            })
            .strict()
            .parse(data)
});

const handler = (scheduler: Scheduler) => {
    return async (req: EndpointRequest<PostSearch>, res: EndpointResponse<PostSearch>) => {
        const { names, limit } = req.body;
        const getSchedules = await scheduler.searchSchedules({
            limit,
            ...(names ? { names } : {})
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
