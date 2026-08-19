import * as z from 'zod';

import { metrics, validateRequest } from '@nangohq/utils';

import { rateLimitedImmediateTaskSchema } from './postRateLimitedImmediate.js';

import type { RateLimitPayload } from './postRateLimitedImmediate.js';
import type { SlidingWindowRateLimiter } from '@nangohq/kvstore';
import type { Scheduler } from '@nangohq/scheduler';
import type { ApiError, Endpoint } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, Route, RouteHandler } from '@nangohq/utils';
import type { JsonObject } from 'type-fest';

const path = '/v1/rate-limited-immediate/batch';
const method = 'POST';
const MAX_BATCH_SIZE = 100;

type RateLimitedImmediateInput = z.infer<typeof rateLimitedImmediateTaskSchema>;

export type RateLimitedImmediateBatchResult =
    | { taskId: string; retryKey: string }
    | { error: { code: 'duplicate_task_name' | 'task_cap_exceeded'; message: string } }
    | { error: { code: 'rate_limit_exceeded'; message: string; payload: RateLimitPayload } };

export type PostRateLimitedImmediateBatch = Endpoint<{
    Method: typeof method;
    Path: typeof path;
    Body: { tasks: RateLimitedImmediateInput[] };
    Error: ApiError<'immediate_batch_failed' | 'invalid_request'>;
    Success: { results: RateLimitedImmediateBatchResult[] };
}>;

const validate = validateRequest<PostRateLimitedImmediateBatch>({
    parseBody: (data: any) =>
        z
            .object({
                tasks: z
                    .array(rateLimitedImmediateTaskSchema)
                    .min(1)
                    .max(MAX_BATCH_SIZE)
                    .check((payload) => {
                        const seen = new Set<string>();
                        const duplicates = new Set<string>();
                        for (const task of payload.value) {
                            if (seen.has(task.name)) {
                                duplicates.add(task.name);
                            }
                            seen.add(task.name);
                        }
                        if (duplicates.size > 0) {
                            payload.issues.push({
                                code: 'custom',
                                message: `duplicate task names within batch: ${[...duplicates].join(', ')}`,
                                input: payload.value
                            });
                        }
                    })
            })
            .strict()
            .parse(data)
});

const handler = (scheduler: Scheduler, rateLimiter: SlidingWindowRateLimiter) => {
    return async (_req: EndpointRequest, res: EndpointResponse<PostRateLimitedImmediateBatch>) => {
        const entries = res.locals.parsedBody.tasks;
        const entriesByRateLimitKey = new Map<string, RateLimitedImmediateInput[]>();
        for (const entry of entries) {
            const entriesForKey = entriesByRateLimitKey.get(entry.rateLimitKey) ?? [];
            entriesForKey.push(entry);
            entriesByRateLimitKey.set(entry.rateLimitKey, entriesForKey);
        }
        const admittedNames = new Set<string>();
        const resultByName = new Map<string, RateLimitedImmediateBatchResult>();

        await Promise.all(
            [...entriesByRateLimitKey.entries()].map(async ([rateLimitKey, entriesForKey]) => {
                const rateLimit = await rateLimiter.consume(rateLimitKey, entriesForKey.length);
                for (const entry of entriesForKey.slice(0, rateLimit.admitted)) {
                    admittedNames.add(entry.name);
                }
                for (const entry of entriesForKey.slice(rateLimit.admitted)) {
                    resultByName.set(entry.name, {
                        error: {
                            code: 'rate_limit_exceeded',
                            message: 'Rate limit exceeded',
                            payload: { retryAfterMs: rateLimit.retryAfterMs }
                        }
                    });
                }
            })
        );

        const admittedEntries = entries.filter((entry) => admittedNames.has(entry.name));
        if (admittedEntries.length > 0) {
            const batch = await scheduler.immediateBatch(
                admittedEntries.map((entry) => ({
                    name: entry.name,
                    payload: entry.args as unknown as JsonObject,
                    groupKey: entry.group.key,
                    groupMaxConcurrency: entry.group.maxConcurrency,
                    retryMax: entry.retry.max,
                    retryCount: entry.retry.count,
                    ownerKey: entry.ownerKey || null,
                    createdToStartedTimeoutSecs: entry.timeoutSettingsInSecs.createdToStarted,
                    startedToCompletedTimeoutSecs: entry.timeoutSettingsInSecs.startedToCompleted,
                    heartbeatTimeoutSecs: entry.timeoutSettingsInSecs.heartbeat
                }))
            );
            if (batch.isErr()) {
                res.status(500).json({ error: { code: 'immediate_batch_failed', message: batch.error.message } });
                return;
            }

            for (const task of batch.value.created) {
                resultByName.set(task.name, { taskId: task.id, retryKey: task.retryKey! });
            }
            let duplicateCount = 0;
            for (const { props, reason } of batch.value.discarded) {
                if (reason === 'duplicate') {
                    duplicateCount++;
                    resultByName.set(props.name, { error: { code: 'duplicate_task_name', message: 'Task with this name already exists' } });
                } else {
                    resultByName.set(props.name, { error: { code: 'task_cap_exceeded', message: 'Per-group task cap exceeded' } });
                }
            }
            if (duplicateCount > 0) {
                metrics.increment(metrics.Types.ORCH_TASKS_DROPPED, duplicateCount, { reason: 'duplicate' });
            }
        }

        const results = entries.map(
            (entry): RateLimitedImmediateBatchResult =>
                resultByName.get(entry.name) ?? { error: { code: 'task_cap_exceeded', message: 'Per-group task cap exceeded' } }
        );
        res.status(200).json({ results });
    };
};

export const route: Route<PostRateLimitedImmediateBatch> = { path, method };

export const routeHandler = (scheduler: Scheduler, rateLimiter: SlidingWindowRateLimiter): RouteHandler<PostRateLimitedImmediateBatch> => ({
    ...route,
    validate,
    handler: handler(scheduler, rateLimiter)
});
