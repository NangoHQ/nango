import * as z from 'zod';

import { validateRequest } from '@nangohq/utils';

import { jsonSchema } from '../../../utils/validation.js';

import type { Scheduler, Task } from '@nangohq/scheduler';
import type { ApiError, Endpoint } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, Result, Route, RouteHandler } from '@nangohq/utils';
import type { JsonValue } from 'type-fest';

type PutTask = Endpoint<{
    Method: typeof method;
    Path: typeof path;
    Params: {
        taskId: string;
    };
    Body: {
        output: JsonValue;
        state: 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
    };
    Error: ApiError<'put_task_failed' | 'invalid_state'>;
    Success: Task;
}>;

const path = '/v1/tasks/:taskId';
const method = 'PUT';

const validate = validateRequest<PutTask>({
    parseBody: (data) =>
        z
            .object({ output: jsonSchema, state: z.enum(['SUCCEEDED', 'FAILED', 'CANCELLED']) })
            .strict()
            .parse(data),
    parseParams: (data) => z.object({ taskId: z.string().uuid() }).strict().parse(data)
});

const handler = (scheduler: Scheduler) => {
    return async (_req: EndpointRequest, res: EndpointResponse<PutTask>) => {
        const { taskId } = res.locals.parsedParams;
        const { state, output } = res.locals.parsedBody;
        let updated: Result<Task>;
        switch (state) {
            case 'SUCCEEDED':
                updated = await scheduler.succeed({ taskId: taskId, output: output });
                break;
            case 'FAILED':
                updated = await scheduler.fail({ taskId: taskId, error: output });
                break;
            case 'CANCELLED':
                updated = await scheduler.cancel({ taskId: taskId, reason: output });
                break;
            default:
                res.status(400).json({ error: { code: 'invalid_state', message: `Invalid state ${state}` } });
                return;
        }
        if (updated.isErr()) {
            res.status(500).json({ error: { code: 'put_task_failed', message: updated.error.message } });
            return;
        }
        res.status(200).json(updated.value);
        return;
    };
};

export const route: Route<PutTask> = { path, method };

export const routeHandler = (scheduler: Scheduler): RouteHandler<PutTask> => {
    return {
        ...route,
        validate,
        handler: handler(scheduler)
    };
};
