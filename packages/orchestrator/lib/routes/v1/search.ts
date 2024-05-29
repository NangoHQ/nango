import { z } from 'zod';
import type { Scheduler, Task } from '@nangohq/scheduler';
import type { ApiError, Endpoint } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, RouteHandler, Route } from '@nangohq/utils';
import { validateRequest } from '@nangohq/utils';

const path = '/v1/search';
const method = 'POST';

type PostSearch = Endpoint<{
    Method: typeof method;
    Path: typeof path;
    Body: {
        ids?: string[] | undefined;
        groupKey?: string | undefined;
        limit?: number | undefined;
    };
    Error: ApiError<'search_failed'>;
    Success: Task[];
}>;

const validate = validateRequest<PostSearch>({
    parseBody: (data) =>
        z
            .object({
                groupKey: z.string().min(1).optional(),
                limit: z.coerce.number().positive().optional(),
                ids: z.array(z.string().uuid()).optional()
            })
            .parse(data)
});

const getHandler = (scheduler: Scheduler) => {
    return async (req: EndpointRequest<PostSearch>, res: EndpointResponse<PostSearch>) => {
        const { ids, groupKey, limit } = req.body;
        const getTasks = await scheduler.search({
            ...(ids ? { ids } : {}),
            ...(groupKey ? { groupKey } : {}),
            ...(limit ? { limit } : {})
        });
        if (getTasks.isErr()) {
            return res.status(500).json({ error: { code: 'search_failed', message: getTasks.error.message } });
        }
        return res.status(201).json(getTasks.value);
    };
};

export const postRoute: Route<PostSearch> = { path, method };

export const postRouteHandler = (scheduler: Scheduler): RouteHandler<PostSearch> => {
    return {
        ...postRoute,
        validate,
        handler: getHandler(scheduler)
    };
};
