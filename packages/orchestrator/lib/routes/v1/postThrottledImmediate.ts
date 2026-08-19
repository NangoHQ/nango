import * as z from 'zod';

import { isDuplicateTaskNameError } from '@nangohq/scheduler';
import { validateRequest } from '@nangohq/utils';

import { immediateTaskSchema } from './postImmediate.js';

import type { SlidingWindowRateLimiter } from '@nangohq/kvstore';
import type { Scheduler } from '@nangohq/scheduler';
import type { ApiError, Endpoint } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, Route, RouteHandler } from '@nangohq/utils';

const path = '/v1/throttled-immediate';
const method = 'POST';

export const throttledImmediateTaskSchema = immediateTaskSchema.extend({ rateLimitKey: z.string().min(1) });

export interface RateLimitPayload {
    retryAfterMs: number;
}

export type PostThrottledImmediate = Endpoint<{
    Method: typeof method;
    Path: typeof path;
    Body: z.infer<typeof throttledImmediateTaskSchema>;
    Error: ApiError<'immediate_failed' | 'duplicate_task_name' | 'invalid_request'> | ApiError<'rate_limit_exceeded', undefined, RateLimitPayload>;
    Success: {
        taskId: string;
        retryKey: string;
    };
}>;

const validate = validateRequest<PostThrottledImmediate>({
    parseBody: (data: any) => throttledImmediateTaskSchema.parse(data)
});

const handler = (scheduler: Scheduler, rateLimiter: SlidingWindowRateLimiter) => {
    return async (_req: EndpointRequest, res: EndpointResponse<PostThrottledImmediate>) => {
        const entry = res.locals.parsedBody;
        const rateLimit = await rateLimiter.consume(entry.rateLimitKey, 1);
        if (rateLimit.rejected > 0) {
            res.setHeader('Retry-After', Math.max(1, Math.ceil(rateLimit.retryAfterMs / 1000)));
            res.status(429).json({
                error: {
                    code: 'rate_limit_exceeded',
                    message: 'Rate limit exceeded',
                    payload: { retryAfterMs: rateLimit.retryAfterMs }
                }
            });
            return;
        }

        const task = await scheduler.immediate({
            name: entry.name,
            payload: entry.args,
            groupKey: entry.group.key,
            groupMaxConcurrency: entry.group.maxConcurrency,
            retryMax: entry.retry.max,
            retryCount: entry.retry.count,
            ownerKey: entry.ownerKey || null,
            createdToStartedTimeoutSecs: entry.timeoutSettingsInSecs.createdToStarted,
            startedToCompletedTimeoutSecs: entry.timeoutSettingsInSecs.startedToCompleted,
            heartbeatTimeoutSecs: entry.timeoutSettingsInSecs.heartbeat
        });
        if (task.isErr()) {
            if (isDuplicateTaskNameError(task.error)) {
                res.status(409).json({ error: { code: 'duplicate_task_name', message: task.error.message } });
                return;
            }

            res.status(500).json({ error: { code: 'immediate_failed', message: task.error.message } });
            return;
        }

        res.status(200).json({ taskId: task.value.id, retryKey: task.value.retryKey! });
    };
};

export const route: Route<PostThrottledImmediate> = { path, method };

export const routeHandler = (scheduler: Scheduler, rateLimiter: SlidingWindowRateLimiter): RouteHandler<PostThrottledImmediate> => ({
    ...route,
    validate,
    handler: handler(scheduler, rateLimiter)
});
