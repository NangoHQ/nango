import { z } from 'zod';
import type { Scheduler } from '@nangohq/scheduler';
import type { ApiError, Endpoint } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, RouteHandler, Route } from '@nangohq/utils';
import { validateRequest } from '@nangohq/utils';

const path = '/v1/recurring';
const method = 'PUT';

export type PutRecurring = Endpoint<{
    Method: typeof method;
    Path: typeof path;
    Body: {
        schedule: { name: string; state: 'STARTED' | 'PAUSED' | 'DELETED' } | { name: string; frequencyMs: number };
    };
    Error: ApiError<'put_recurring_failed'>;
    Success: { scheduleId: string };
}>;

const validate = validateRequest<PutRecurring>({
    parseBody: (data: any) => {
        return z
            .object({
                schedule: z.union([
                    z.object({
                        name: z.string().min(1),
                        state: z.union([z.literal('STARTED'), z.literal('PAUSED'), z.literal('DELETED')])
                    }),
                    z.object({
                        name: z.string().min(1),
                        frequencyMs: z.number().int().positive()
                    })
                ])
            })
            .strict()
            .parse(data);
    }
});

const handler = (scheduler: Scheduler) => {
    return async (req: EndpointRequest<PutRecurring>, res: EndpointResponse<PutRecurring>) => {
        const { schedule } = req.body;
        let updatedSchedule;
        if ('state' in schedule) {
            updatedSchedule = await scheduler.setScheduleState({ scheduleName: schedule.name, state: schedule.state });
        }
        if ('frequencyMs' in schedule) {
            updatedSchedule = await scheduler.setScheduleFrequency({ scheduleName: schedule.name, frequencyMs: schedule.frequencyMs });
        }
        if (!updatedSchedule) {
            res.status(400).json({ error: { code: 'put_recurring_failed', message: `invalid parameters: ${JSON.stringify(schedule)}` } });
            return;
        }
        if (updatedSchedule.isErr()) {
            res.status(500).json({ error: { code: 'put_recurring_failed', message: updatedSchedule.error.message } });
            return;
        }
        res.status(200).json({ scheduleId: updatedSchedule.value.id });
        return;
    };
};

export const route: Route<PutRecurring> = { path, method };

export const routeHandler = (scheduler: Scheduler): RouteHandler<PutRecurring> => {
    return {
        ...route,
        validate,
        handler: handler(scheduler)
    };
};
