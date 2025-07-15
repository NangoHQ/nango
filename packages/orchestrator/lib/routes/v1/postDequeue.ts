import { z } from 'zod';

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
        groupKey: string;
        limit: number;
        longPolling: boolean;
    };
    Error: ApiError<'dequeue_failed'>;
    Success: Task[];
}>;

const validate = validateRequest<PostDequeue>({
    parseBody: (data) =>
        z
            .object({
                groupKey: z.string().min(1),
                limit: z.coerce.number().positive(),
                longPolling: z.coerce.boolean()
            })
            .strict()
            .parse(data)
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
        const { groupKey, limit, longPolling } = res.locals.parsedBody;
        const longPollingTimeoutMs = 10_000;
        const eventId = taskEvents.taskCreated(groupKey);
        const groupKeyPrefix = `${groupKey}*`; // Dequeuing all tasks with the same group key prefix
        const cleanupAndRespond = (respond: (res: EndpointResponse<PostDequeue>) => void) => {
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
        const onTaskStarted = () => {
            cleanupAndRespond(async (res) => {
                const getTasks = await scheduler.dequeue({ groupKey: groupKeyPrefix, limit });
                if (getTasks.isErr()) {
                    res.status(500).json({ error: { code: 'dequeue_failed', message: getTasks.error.message } });
                } else {
                    res.status(200).json(getTasks.value);
                }
            });
        };
        const timeout = setTimeout(() => {
            cleanupAndRespond((res) => res.status(200).send([]));
        }, longPollingTimeoutMs);

        const getTasks = await scheduler.dequeue({ groupKey: groupKeyPrefix, limit });
        if (getTasks.isErr()) {
            cleanupAndRespond((res) => res.status(500).json({ error: { code: 'dequeue_failed', message: getTasks.error.message } }));
            return;
        }
        if (longPolling && getTasks.value.length === 0) {
            eventEmitter.once(eventId, onTaskStarted);
            await new Promise((resolve) => resolve(timeout));
        } else {
            cleanupAndRespond((res) => res.status(200).json(getTasks.value));
        }
        return;
    };
};
