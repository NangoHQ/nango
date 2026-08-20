import * as z from 'zod';

import { metrics, validateRequest } from '@nangohq/utils';

import { immediateTaskSchema } from './postImmediate.js';

import type { ImmediateSuccess, RateLimitPayload } from './postImmediate.js';
import type { SlidingWindowRateLimiter } from '@nangohq/kvstore';
import type { Scheduler } from '@nangohq/scheduler';
import type { ApiError, Endpoint } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, Route, RouteHandler } from '@nangohq/utils';
import type { JsonObject } from 'type-fest';

const path = '/v1/immediate/batch';
const method = 'POST';

const MAX_BATCH_SIZE = 100;

type ImmediateInput = z.infer<typeof immediateTaskSchema>;

export type ImmediateBatchResult =
    | ImmediateSuccess
    | { error: { code: 'duplicate_task_name' | 'task_cap_exceeded'; message: string } }
    | { error: { code: 'rate_limit_exceeded'; message: string; payload: RateLimitPayload } };

export type PostImmediateBatch = Endpoint<{
    Method: typeof method;
    Path: typeof path;
    Body: {
        tasks: ImmediateInput[];
    };
    Error: ApiError<'immediate_batch_failed' | 'invalid_request'>;
    Success: { results: ImmediateBatchResult[] };
}>;

const validate = validateRequest<PostImmediateBatch>({
    parseBody: (data: any) => {
        const schema = z
            .object({
                tasks: z
                    .array(immediateTaskSchema)
                    .min(1)
                    .max(MAX_BATCH_SIZE)
                    // Reject batches that contain the same task name more than once.
                    .check((payload) => {
                        const seen = new Set<string>();
                        const duplicates = new Set<string>();
                        for (const t of payload.value) {
                            if (seen.has(t.name)) {
                                duplicates.add(t.name);
                            }
                            seen.add(t.name);
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
            .strict();
        return schema.parse(data);
    }
});

const handler = (scheduler: Scheduler, rateLimiter: SlidingWindowRateLimiter) => {
    return async (_req: EndpointRequest, res: EndpointResponse<PostImmediateBatch>) => {
        const entries = res.locals.parsedBody.tasks;
        const admitted = entries.map((entry) => !entry.rateLimitKey);
        const entriesByRateLimitKey = Map.groupBy(
            entries.flatMap((entry, index) => (entry.rateLimitKey ? [{ entry, index, rateLimitKey: entry.rateLimitKey }] : [])),
            ({ rateLimitKey }) => rateLimitKey
        );
        const resultByName = new Map<string, ImmediateBatchResult>();

        let rateLimitedCount = 0;
        await Promise.all(
            [...entriesByRateLimitKey.entries()].map(async ([rateLimitKey, entriesForKey]) => {
                const rateLimit = await rateLimiter.consume(rateLimitKey, entriesForKey.length);
                for (const { index } of entriesForKey.slice(0, rateLimit.admitted)) {
                    admitted[index] = true;
                }
                for (const { entry } of entriesForKey.slice(rateLimit.admitted)) {
                    rateLimitedCount++;
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
        if (rateLimitedCount > 0) {
            metrics.increment(metrics.Types.ORCH_TASKS_DROPPED, rateLimitedCount, { reason: 'rate_limit' });
        }

        const admittedEntries = entries.filter((_, index) => admitted[index]);
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

            // Names are unique within a batch, so each name keys exactly one outcome.
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

        const results: ImmediateBatchResult[] = entries.map(
            (entry) => resultByName.get(entry.name) ?? { error: { code: 'task_cap_exceeded', message: 'Per-group task cap exceeded' } }
        );
        res.status(200).json({ results });
    };
};

export const route: Route<PostImmediateBatch> = { path, method };

export const routeHandler = (scheduler: Scheduler, rateLimiter: SlidingWindowRateLimiter): RouteHandler<PostImmediateBatch> => {
    return {
        ...route,
        validate,
        handler: handler(scheduler, rateLimiter)
    };
};
