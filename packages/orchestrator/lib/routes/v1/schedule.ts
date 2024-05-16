import { z } from 'zod';
import type { Json, Scheduler } from '@nangohq/scheduler';
import type { ApiError, Endpoint } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, RouteHandler, Route } from '@nangohq/utils';
import { validateRequest } from '@nangohq/utils';
import { jsonSchema } from '../../utils/validation.js';

type Schedule = Endpoint<{
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
        args: {
            name: string;
            connection: {
                id: number;
                provider_config_key: string;
                environment_id: number;
            };
            activityLogId: number;
            input: Json;
        };
    };
    Error: ApiError<'schedule_failed'>;
    Success: { taskId: string };
}>;

const path = '/v1/schedule';
const method = 'POST';

const validate = validateRequest<Schedule>({
    parseBody: (data) =>
        z
            .object({
                scheduling: z.literal('immediate'),
                name: z.string().nonempty(),
                groupKey: z.string().nonempty(),
                retry: z.object({
                    count: z.number().int(),
                    max: z.number().int()
                }),
                timeoutSettingsInSecs: z.object({
                    createdToStarted: z.number().int().positive(),
                    startedToCompleted: z.number().int().positive(),
                    heartbeat: z.number().int().positive()
                }),
                args: z.object({
                    name: z.string().nonempty(),
                    connection: z.object({
                        id: z.number().positive(),
                        provider_config_key: z.string().nonempty(),
                        environment_id: z.number().positive()
                    }),
                    activityLogId: z.number().positive(),
                    input: z.optional(jsonSchema).default({})
                })
            })
            .parse(data)
});

const getHandler = (scheduler: Scheduler) => {
    return async (req: EndpointRequest<Schedule>, res: EndpointResponse<Schedule>) => {
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

export const route: Route<Schedule> = { path, method };

export const getRouteHandler = (scheduler: Scheduler): RouteHandler<Schedule> => {
    return {
        ...route,
        validate,
        handler: getHandler(scheduler)
    };
};
