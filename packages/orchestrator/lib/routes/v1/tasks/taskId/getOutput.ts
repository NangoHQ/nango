import { z } from 'zod';
import type { JsonValue } from 'type-fest';
import type { Scheduler, Task, TaskState } from '@nangohq/scheduler';
import type { ApiError, Endpoint } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, RouteHandler, Route } from '@nangohq/utils';
import { validateRequest } from '@nangohq/utils';
import type { EventEmitter } from 'node:events';

type GetOutput = Endpoint<{
    Method: typeof method;
    Path: typeof path;
    Params: {
        taskId: string;
    };
    Querystring: {
        longPolling?: number | undefined;
    };
    Error: ApiError<'task_not_found' | 'timeout'>;
    Success: { state: TaskState; output: JsonValue };
}>;

const path = '/v1/tasks/:taskId/output';
const method = 'GET';

const validate = validateRequest<GetOutput>({
    parseQuery: (data) =>
        z
            .object({
                longPolling: z.coerce.number().optional()
            })
            .parse(data),
    parseParams: (data) => z.object({ taskId: z.string().uuid() }).strict().parse(data)
});

const handler = (scheduler: Scheduler, eventEmitter: EventEmitter) => {
    return async (req: EndpointRequest<GetOutput>, res: EndpointResponse<GetOutput>) => {
        const longPollingTimeoutMs = req.query.longPolling || 120_000;
        const eventId = `task:completed:${req.params.taskId}`;
        const cleanupAndRespond = (respond: (res: EndpointResponse<GetOutput>) => void) => {
            if (timeout) {
                clearTimeout(timeout);
            }
            if (onCompletion) {
                eventEmitter.removeListener(eventId, onCompletion);
            }
            if (!res.writableEnded) {
                respond(res);
            }
        };
        const onCompletion = (completedTask: Task) => {
            cleanupAndRespond((res) => res.status(200).json({ state: completedTask.state, output: completedTask.output }));
        };
        const timeout = setTimeout(() => {
            cleanupAndRespond((res) => res.status(408).send({ error: { code: 'timeout', message: 'Long polling timeout' } }));
        }, longPollingTimeoutMs);

        eventEmitter.once(eventId, onCompletion);

        const task = await scheduler.get({ taskId: req.params.taskId });
        if (task.isErr()) {
            cleanupAndRespond((res) => res.status(404).json({ error: { code: 'task_not_found', message: task.error.message } }));
            return;
        }
        if (req.query.longPolling && (task.value.state === 'CREATED' || task.value.state === 'STARTED')) {
            await new Promise((resolve) => resolve(timeout));
        } else {
            cleanupAndRespond((res) => res.status(200).json({ state: task.value.state, output: task.value.output }));
        }
        return;
    };
};

export const route: Route<GetOutput> = { path, method };

export const routeHandler = (scheduler: Scheduler, eventEmmiter: EventEmitter): RouteHandler<GetOutput> => {
    return {
        ...route,
        validate,
        handler: handler(scheduler, eventEmmiter)
    };
};
