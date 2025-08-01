import * as z from 'zod';

import { validateRequest } from '@nangohq/utils';

import type { Scheduler, TaskState } from '@nangohq/scheduler';
import type { Endpoint } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, Route, RouteHandler } from '@nangohq/utils';
import type { JsonValue } from 'type-fest';

type GetRetryOutput = Endpoint<{
    Method: typeof method;
    Path: typeof path;
    Params: {
        retryKey: string;
    };
    Querystring: {
        ownerKey: string;
    };
    Success: { state: TaskState; output: JsonValue } | { state: 'no_tasks' } | { state: 'in_progress' };
}>;

const path = '/v1/retries/:retryKey/output';
const method = 'GET';

const validate = validateRequest<GetRetryOutput>({
    parseQuery: (data) =>
        z
            .object({ ownerKey: z.string().min(1) })
            .strict()
            .parse(data),
    parseParams: (data) => z.object({ retryKey: z.string().uuid() }).strict().parse(data)
});

const handler = (scheduler: Scheduler) => {
    return async (_req: EndpointRequest, res: EndpointResponse<GetRetryOutput>) => {
        const tasks = await scheduler.searchTasks({ retryKey: res.locals.parsedParams.retryKey, ownerKey: res.locals.parsedQuery.ownerKey });
        if (tasks.isErr()) {
            res.status(500).send({ error: { code: 'server_error', message: 'Failed to fetch tasks' } });
            return;
        }
        if (tasks.value.length === 0) {
            res.status(200).send({ state: 'no_tasks' });
            return;
        }
        for (const task of tasks.value) {
            if (!task.terminated) {
                continue;
            }
            if (task.retryCount === task.retryMax || task.state === 'SUCCEEDED') {
                res.send({
                    state: task.state,
                    output: task.output
                });
                return;
            }
        }
        res.status(200).send({ state: 'in_progress' });
        return;
    };
};

export const route: Route<GetRetryOutput> = { path, method };

export const routeHandler = (scheduler: Scheduler): RouteHandler<GetRetryOutput> => {
    return {
        ...route,
        validate,
        handler: handler(scheduler)
    };
};
