import { z } from 'zod';
import type { Scheduler, Task } from '@nangohq/scheduler';
import type { ApiError, Endpoint } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, RouteHandler, Route } from '@nangohq/utils';
import { validateRequest } from '@nangohq/utils';

const path = '/v1/tasks/search';
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
            .strict()
            .parse(data)
});

const handler = (scheduler: Scheduler) => {
    return async (req: EndpointRequest<PostSearch>, res: EndpointResponse<PostSearch>) => {
        const { ids, groupKey, limit } = req.body;
        const getTasks = await scheduler.searchTasks({
            ...(ids ? { ids } : {}),
            ...(groupKey ? { groupKey } : {}),
            ...(limit ? { limit } : {})
        });
        if (getTasks.isErr()) {
            res.status(500).json({ error: { code: 'search_failed', message: getTasks.error.message } });
            return;
        }
        res.status(200).json(getTasks.value);
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
