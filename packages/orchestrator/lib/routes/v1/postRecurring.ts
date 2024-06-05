import { z } from 'zod';
import type { JsonValue } from 'type-fest';
import type { Scheduler } from '@nangohq/scheduler';
import type { ApiError, Endpoint } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, RouteHandler, Route } from '@nangohq/utils';
import { validateRequest } from '@nangohq/utils';
import { syncArgsSchema } from '../../clients/validate.js';

const path = '/v1/recurring';
const method = 'POST';

export type PostRecurring = Endpoint<{
    Method: typeof method;
    Path: typeof path;
    Body: {
        name: string;
        startsAt: Date;
        frequencyMs: number;
        args: JsonValue;
    };
    Error: ApiError<'recurring_failed'>;
    Success: { scheduleId: string };
}>;

const validate = validateRequest<PostRecurring>({
    parseBody: (data: any) => {
        return z
            .object({
                name: z.string().min(1),
                startsAt: z.coerce.date(),
                frequencyMs: z.number().int().positive(),
                args: syncArgsSchema
            })
            .parse(data);
    }
});

const handler = (scheduler: Scheduler) => {
    return async (req: EndpointRequest<PostRecurring>, res: EndpointResponse<PostRecurring>) => {
        const schedule = await scheduler.recurring({
            name: req.body.name,
            payload: req.body.args,
            startsAt: req.body.startsAt,
            frequencyMs: req.body.frequencyMs
        });
        if (schedule.isErr()) {
            return res.status(500).json({ error: { code: 'recurring_failed', message: schedule.error.message } });
        }
        return res.status(201).json({ scheduleId: schedule.value.id });
    };
};

export const route: Route<PostRecurring> = { path, method };

export const routeHandler = (scheduler: Scheduler): RouteHandler<PostRecurring> => {
    return {
        ...route,
        validate,
        handler: handler(scheduler)
    };
};
