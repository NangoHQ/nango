import { z } from 'zod';
import type { Scheduler } from '@nangohq/scheduler';
import type { ApiError, Endpoint } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, RouteHandler, Route } from '@nangohq/utils';
import { validateRequest } from '@nangohq/utils';

const path = '/v1/tasks/:taskId/heartbeat';
const method = 'POST';

type PostHeartbeat = Endpoint<{
    Method: typeof method;
    Path: typeof path;
    Params: {
        taskId: string;
    };
    Error: ApiError<'post_heartbeat_failed'>;
    Success: never;
}>;

const validate = validateRequest<PostHeartbeat>({
    parseParams: (data) => z.object({ taskId: z.string().uuid() }).parse(data)
});

const handler = (scheduler: Scheduler) => {
    return async (req: EndpointRequest<PostHeartbeat>, res: EndpointResponse<PostHeartbeat>) => {
        const { taskId } = req.params;
        const heartbeat = await scheduler.heartbeat({ taskId: taskId });
        if (heartbeat.isErr()) {
            res.status(500).json({ error: { code: 'post_heartbeat_failed', message: heartbeat.error.message } });
            return;
        }
        res.status(204).send();
        return;
    };
};

export const route: Route<PostHeartbeat> = { path, method };

export const routeHandler = (scheduler: Scheduler): RouteHandler<PostHeartbeat> => {
    return {
        ...route,
        validate,
        handler: handler(scheduler)
    };
};
