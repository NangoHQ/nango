import * as z from 'zod';

import { validateRequest } from '@nangohq/utils';

import type { Scheduler } from '@nangohq/scheduler';
import type { ApiError, Endpoint } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, Route, RouteHandler } from '@nangohq/utils';

const path = '/v1/schedules/reconcile-concurrency';
const method = 'POST';

export type PostReconcileConcurrency = Endpoint<{
    Method: typeof method;
    Path: typeof path;
    Body: {
        groupKeyPrefix: string;
        overrides: { groupKey: string; maxConcurrency: number }[];
    };
    Error: ApiError<'reconcile_concurrency_failed'>;
    Success: { updated: number };
}>;

const bodySchema = z
    .object({
        groupKeyPrefix: z.string().min(1),
        overrides: z
            .array(
                z
                    .object({
                        groupKey: z.string().min(1),
                        maxConcurrency: z.coerce.number().int().nonnegative()
                    })
                    .strict()
            )
            .default([])
    })
    .strict()
    .refine((body) => body.overrides.every((o) => o.groupKey.startsWith(body.groupKeyPrefix)), {
        message: 'every override groupKey must start with groupKeyPrefix'
    });

const validate = validateRequest<PostReconcileConcurrency>({
    parseBody: (data: any) => bodySchema.parse(data)
});

const handler = (scheduler: Scheduler) => {
    return async (_req: EndpointRequest, res: EndpointResponse<PostReconcileConcurrency>) => {
        const reconciled = await scheduler.reconcileGroupMaxConcurrency({
            groupKeyPrefix: res.locals.parsedBody.groupKeyPrefix,
            overrides: res.locals.parsedBody.overrides
        });
        if (reconciled.isErr()) {
            res.status(500).json({ error: { code: 'reconcile_concurrency_failed', message: reconciled.error.message } });
            return;
        }
        res.status(200).json({ updated: reconciled.value.updated });
        return;
    };
};

export const route: Route<PostReconcileConcurrency> = { path, method };

export const routeHandler = (scheduler: Scheduler): RouteHandler<PostReconcileConcurrency> => {
    return {
        ...route,
        validate,
        handler: handler(scheduler)
    };
};
