import { z } from 'zod';
import type { JsonValue } from 'type-fest';
import type { Scheduler } from '@nangohq/scheduler';
import type { ApiError, Endpoint } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, RouteHandler, Route } from '@nangohq/utils';
import { validateRequest } from '@nangohq/utils';
import type { TaskType } from '../../types.js';
import { syncArgsSchema, actionArgsSchema, postConnectionArgsSchema, webhookArgsSchema } from '../../clients/validate.js';

const path = '/v1/schedule';
const method = 'POST';

export type PostSchedule = Endpoint<{
    Method: typeof method;
    Path: typeof path;
    Body: {
        scheduling: 'immediate';
        name: string;
        groupKey: string;
        retry: {
            count: number;
            max: number;
        };
        timeoutSettingsInSecs: {
            createdToStarted: number;
            startedToCompleted: number;
            heartbeat: number;
        };
        args: JsonValue & { type: TaskType };
    };
    Error: ApiError<'schedule_failed'>;
    Success: { taskId: string };
}>;

const validate = validateRequest<PostSchedule>({
    parseBody: (data: any) => {
        function argsSchema(data: any) {
            if ('args' in data && 'type' in data.args) {
                switch (data.args.type) {
                    case 'sync':
                        return syncArgsSchema;
                    case 'action':
                        return actionArgsSchema;
                    case 'webhook':
                        return webhookArgsSchema;
                    case 'post-connection-script':
                        return postConnectionArgsSchema;
                    default:
                        throw new Error(`Invalid task type: '${data.args.type}'`);
                }
            }
            throw new Error('Missing task type');
        }
        return z
            .object({
                scheduling: z.literal('immediate'),
                name: z.string().min(1),
                groupKey: z.string().min(1),
                retry: z.object({
                    count: z.number().int(),
                    max: z.number().int()
                }),
                timeoutSettingsInSecs: z.object({
                    createdToStarted: z.number().int().positive(),
                    startedToCompleted: z.number().int().positive(),
                    heartbeat: z.number().int().positive()
                }),
                args: argsSchema(data)
            })
            .parse(data);
    }
});

const handler = (scheduler: Scheduler) => {
    return async (req: EndpointRequest<PostSchedule>, res: EndpointResponse<PostSchedule>) => {
        const task = await scheduler.schedule({
            scheduling: req.body.scheduling,
            taskProps: {
                name: req.body.name,
                payload: req.body.args,
                groupKey: req.body.groupKey,
                retryMax: req.body.retry.max,
                retryCount: req.body.retry.count,
                createdToStartedTimeoutSecs: req.body.timeoutSettingsInSecs.createdToStarted,
                startedToCompletedTimeoutSecs: req.body.timeoutSettingsInSecs.startedToCompleted,
                heartbeatTimeoutSecs: req.body.timeoutSettingsInSecs.heartbeat
            }
        });
        if (task.isErr()) {
            return res.status(500).json({ error: { code: 'schedule_failed', message: task.error.message } });
        }
        return res.status(201).json({ taskId: task.value.id });
    };
};

export const route: Route<PostSchedule> = { path, method };

export const routeHandler = (scheduler: Scheduler): RouteHandler<PostSchedule> => {
    return {
        ...route,
        validate,
        handler: handler(scheduler)
    };
};
