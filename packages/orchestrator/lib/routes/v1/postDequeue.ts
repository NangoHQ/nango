import * as z from 'zod';

import { validateRequest } from '@nangohq/utils';

import { taskEvents } from '../../events.js';

import type { Scheduler, Task } from '@nangohq/scheduler';
import type { ApiError, Endpoint } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, Route, RouteHandler } from '@nangohq/utils';
import type EventEmitter from 'node:events';

const path = '/v1/dequeue';
const method = 'POST';

type PostDequeue = Endpoint<{
    Method: typeof method;
    Path: typeof path;
    Body: {
        groupKeyPattern: string;
        limit: number;
        longPolling: boolean;
    };
    Error: ApiError<'dequeue_failed'>;
    Success: Task[];
}>;

const bodySchema = z
    .object({
        limit: z.coerce.number().positive(),
        longPolling: z.coerce.boolean(),
        groupKeyPattern: z.string().min(1)
    })
    .strict();

const validate = validateRequest<PostDequeue>({
    parseBody: (data) => bodySchema.parse(data)
});

export const route: Route<PostDequeue> = { path, method };

export const routeHandler = (scheduler: Scheduler, eventEmitter: EventEmitter): RouteHandler<PostDequeue> => {
    return {
        ...route,
        validate,
        handler: handler(scheduler, eventEmitter)
    };
};

const handler = (scheduler: Scheduler, eventEmitter: EventEmitter) => {
    return async (_req: EndpointRequest, res: EndpointResponse<PostDequeue>) => {
        const { groupKeyPattern, limit, longPolling } = res.locals.parsedBody;
        const longPollingTimeoutMs = 10_000;
        const deadline = Date.now() + longPollingTimeoutMs;
        const taskCreatedEventId = taskEvents.taskCreated(groupKeyPattern);
        const cleanupAndRespond = (respond: (res: EndpointResponse<PostDequeue>) => void) => {
            if (timeout) {
                clearTimeout(timeout);
            }
            if (onTaskCreated) {
                eventEmitter.removeListener(taskCreatedEventId, onTaskCreated);
            }
            if (!res.writableEnded) {
                respond(res);
            }
        };

        const armTimeout = () => setTimeout(() => cleanupAndRespond((res) => res.status(200).send([])), Math.max(0, deadline - Date.now()));

        const onTaskCreated = (): void => {
            clearTimeout(timeout); // stop the timeout from firing while dequeue is in flight
            void (async () => {
                const getTasks = await scheduler.dequeue({ groupKeyPattern, limit });
                if (getTasks.isErr()) {
                    cleanupAndRespond((res) => res.status(500).json({ error: { code: 'dequeue_failed', message: getTasks.error.message } }));
                } else if (getTasks.value.length > 0) {
                    cleanupAndRespond((res) => res.status(200).json(getTasks.value));
                } else {
                    // no tasks were dequeued, re-arm the timeout and wait for next event
                    timeout = armTimeout();
                    eventEmitter.once(taskCreatedEventId, onTaskCreated);
                }
            })();
        };
        let timeout = armTimeout();

        const getTasks = await scheduler.dequeue({ groupKeyPattern, limit });
        if (getTasks.isErr()) {
            cleanupAndRespond((res) => res.status(500).json({ error: { code: 'dequeue_failed', message: getTasks.error.message } }));
            return;
        }
        if (longPolling && getTasks.value.length === 0) {
            eventEmitter.once(taskCreatedEventId, onTaskCreated);
            await new Promise((resolve) => resolve(timeout));
        } else {
            cleanupAndRespond((res) => res.status(200).json(getTasks.value));
        }
        return;
    };
};
