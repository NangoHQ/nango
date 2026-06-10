import * as z from 'zod';

import { validateRequest } from '@nangohq/utils';

import type { ScheduleState, Scheduler } from '@nangohq/scheduler';
import type { ApiError, Endpoint } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, Route, RouteHandler } from '@nangohq/utils';

const path = '/v1/recurring/states';
const method = 'PUT';

export type PutRecurringStates = Endpoint<{
    Method: typeof method;
    Path: typeof path;
    Body: {
        names: string[];
        state: 'STARTED' | 'PAUSED' | 'DELETED';
    };
    Error: ApiError<'put_recurring_states_failed'>;
    Success: { success: true };
}>;

const bodySchema = z
    .object({
        // Bounded so a single bulk call can't lock an unbounded number of schedules at once.
        names: z.array(z.string().min(1)).min(1).max(1000),
        state: z.enum(['STARTED', 'PAUSED', 'DELETED'] satisfies ScheduleState[])
    })
    .strict();

const validate = validateRequest<PutRecurringStates>({
    parseBody: (data: any) => bodySchema.parse(data)
});

const handler = (scheduler: Scheduler) => {
    return async (_req: EndpointRequest, res: EndpointResponse<PutRecurringStates>) => {
        const { names, state } = res.locals.parsedBody;
        const updated = await scheduler.setScheduleStates({ scheduleNames: names, state });
        if (updated.isErr()) {
            res.status(500).json({ error: { code: 'put_recurring_states_failed', message: updated.error.message } });
            return;
        }
        res.status(200).json({ success: true });
        return;
    };
};

export const route: Route<PutRecurringStates> = { path, method };

export const routeHandler = (scheduler: Scheduler): RouteHandler<PutRecurringStates> => {
    return {
        ...route,
        validate,
        handler: handler(scheduler)
    };
};
