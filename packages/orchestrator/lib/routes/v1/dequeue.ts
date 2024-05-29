import { z } from 'zod';
import type { Scheduler, Task } from '@nangohq/scheduler';
import type { ApiError, Endpoint } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, RouteHandler, Route } from '@nangohq/utils';
import { validateRequest } from '@nangohq/utils';
import type EventEmitter from 'node:events';

const path = '/v1/dequeue';
const method = 'GET';

type GetDequeue = Endpoint<{
    Method: typeof method;
    Path: typeof path;
    Querystring: {
        groupKey: string;
        limit: number;
        waitForCompletion?: boolean;
    };
    Error: ApiError<'dequeue_failed'>;
    Success: Task[];
}>;

const validate = validateRequest<GetDequeue>({
    parseQuery: (data) =>
        z
            .object({
                groupKey: z.string().min(1),
                limit: z.coerce.number().positive(),
                waitForCompletion: z
                    .string()
                    .optional()
                    .default('false')
                    .transform((val) => val === 'true')
            })
            .parse(data)
});

export const getRoute: Route<GetDequeue> = { path, method };

export const getRouteHandler = (scheduler: Scheduler, eventEmitter: EventEmitter): RouteHandler<GetDequeue> => {
    return {
        ...getRoute,
        validate,
        handler: getHandler(scheduler, eventEmitter)
    };
};

const getHandler = (scheduler: Scheduler, eventEmitter: EventEmitter) => {
    return async (req: EndpointRequest<GetDequeue>, res: EndpointResponse<GetDequeue>) => {
        const { groupKey, limit } = req.query;
        const waitForCompletionTimeoutMs = 60_000;
        const eventId = `task:started:${groupKey}`;
        const cleanupAndRespond = (respond: (res: EndpointResponse<GetDequeue>) => void) => {
            if (timeout) {
                clearTimeout(timeout);
            }
            if (onTaskStarted) {
                eventEmitter.removeListener(eventId, onTaskStarted);
            }
            if (!res.writableEnded) {
                respond(res);
            }
        };
        const onTaskStarted = async (_t: Task) => {
            const getTasks = await scheduler.dequeue({ groupKey, limit });
            if (getTasks.isErr()) {
                cleanupAndRespond((res) => res.status(500).json({ error: { code: 'dequeue_failed', message: getTasks.error.message } }));
            } else {
                cleanupAndRespond((res) => res.status(200).json(getTasks.value));
            }
        };
        const timeout = setTimeout(() => {
            cleanupAndRespond((res) => res.status(200).send([]));
        }, waitForCompletionTimeoutMs);

        eventEmitter.once(eventId, onTaskStarted);

        const getTasks = await scheduler.dequeue({ groupKey, limit });
        if (getTasks.isErr()) {
            cleanupAndRespond((res) => res.status(500).json({ error: { code: 'dequeue_failed', message: getTasks.error.message } }));
            return;
        }
        if (req.query.waitForCompletion && getTasks.value.length === 0) {
            await new Promise((resolve) => resolve(timeout));
        } else {
            cleanupAndRespond((res) => res.status(200).json(getTasks.value));
        }
        return;
    };
};
