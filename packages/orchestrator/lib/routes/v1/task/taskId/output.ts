import { z } from 'zod';
import type { JsonValue } from 'type-fest';
import type { Scheduler, Task, TaskState } from '@nangohq/scheduler';
import type { ApiError, Endpoint } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, RouteHandler, Route } from '@nangohq/utils';
import { validateRequest } from '@nangohq/utils';
import type { EventEmitter } from 'node:events';
import { getEventId } from '../../../../events.js';

type Output = Endpoint<{
    Method: typeof method;
    Path: typeof path;
    Params: {
        taskId: string;
    };
    Querystring: {
        waitForCompletion?: boolean;
    };
    Error: ApiError<'task_not_found'>;
    Success: { state: TaskState; output: JsonValue };
}>;

const path = '/v1/task/:taskId/output';
const method = 'GET';

const validate = validateRequest<Output>({
    parseQuery: (data) =>
        z
            .object({
                waitForCompletion: z
                    .string()
                    .optional()
                    .default('false')
                    .transform((val) => val === 'true')
            })
            .parse(data),
    parseParams: (data) => z.object({ taskId: z.string().uuid() }).parse(data)
});

const getHandler = (scheduler: Scheduler, eventEmitter: EventEmitter) => {
    return async (req: EndpointRequest<Output>, res: EndpointResponse<Output>) => {
        const waitForCompletionTimeoutMs = 120_000;
        const eventId = getEventId('completed', req.params.taskId);
        const cleanupAndRespond = (respond: (res: EndpointResponse<Output>) => void) => {
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
            cleanupAndRespond((res) => res.status(204).send());
        }, waitForCompletionTimeoutMs);

        eventEmitter.once(eventId, onCompletion);

        const task = await scheduler.get({ taskId: req.params.taskId });
        if (task.isErr()) {
            cleanupAndRespond((res) => res.status(404).json({ error: { code: 'task_not_found', message: task.error.message } }));
            return;
        }
        if (req.query.waitForCompletion && (task.value.state === 'CREATED' || task.value.state === 'STARTED')) {
            await new Promise((resolve) => resolve(timeout));
        } else {
            cleanupAndRespond((res) => res.status(200).json({ state: task.value.state, output: task.value.output }));
        }
        return;
    };
};

export const route: Route<Output> = { path, method };

export const getRouteHandler = (scheduler: Scheduler, eventEmmiter: EventEmitter): RouteHandler<Output> => {
    return {
        ...route,
        validate,
        handler: getHandler(scheduler, eventEmmiter)
    };
};
