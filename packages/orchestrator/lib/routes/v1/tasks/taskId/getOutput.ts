import { z } from 'zod';

import { validateRequest } from '@nangohq/utils';

import { taskEvents } from '../../../../events.js';

import type { Scheduler, Task, TaskState } from '@nangohq/scheduler';
import type { ApiError, Endpoint } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, Route, RouteHandler } from '@nangohq/utils';
import type { EventEmitter } from 'node:events';
import type { JsonValue } from 'type-fest';

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
    return async (_req: EndpointRequest, res: EndpointResponse<GetOutput>) => {
        const longPollingTimeoutMs = res.locals.parsedQuery.longPolling || 120_000;
        const eventId = taskEvents.taskCompleted(res.locals.parsedParams.taskId);
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
        const onCompletion = async (taskId: Task['id']) => {
            const completedTask = await scheduler.get({ taskId });
            if (completedTask.isErr()) {
                cleanupAndRespond((res) => res.status(404).json({ error: { code: 'task_not_found', message: completedTask.error.message } }));
                return;
            }
            cleanupAndRespond((res) => res.status(200).json({ state: completedTask.value.state, output: completedTask.value.output }));
        };
        const timeout = setTimeout(() => {
            cleanupAndRespond((res) => res.status(408).send({ error: { code: 'timeout', message: 'Long polling timeout' } }));
        }, longPollingTimeoutMs);

        eventEmitter.once(eventId, onCompletion);

        const task = await scheduler.get({ taskId: res.locals.parsedParams.taskId });
        if (task.isErr()) {
            cleanupAndRespond((res) => res.status(404).json({ error: { code: 'task_not_found', message: task.error.message } }));
            return;
        }
        if (res.locals.parsedQuery.longPolling && (task.value.state === 'CREATED' || task.value.state === 'STARTED')) {
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
