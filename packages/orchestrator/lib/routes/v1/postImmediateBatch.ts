import * as z from 'zod';

import { metrics, validateRequest } from '@nangohq/utils';

import { actionArgsSchema, onEventArgsSchema, syncAbortArgsSchema, syncArgsSchema, webhookArgsSchema } from '../../clients/validate.js';

import type { Scheduler } from '@nangohq/scheduler';
import type { ApiError, Endpoint } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, Route, RouteHandler } from '@nangohq/utils';
import type { JsonObject } from 'type-fest';

const path = '/v1/immediate/batch';
const method = 'POST';

const MAX_BATCH_SIZE = 100;

const argsUnion = z.union([syncArgsSchema, actionArgsSchema, webhookArgsSchema, onEventArgsSchema, syncAbortArgsSchema]);

const entrySchema = z
    .object({
        name: z.string().min(1),
        ownerKey: z.string().optional().default(''),
        group: z.object({
            key: z.string().min(1),
            maxConcurrency: z.coerce.number()
        }),
        retry: z.object({
            count: z.number().int(),
            max: z.number().int()
        }),
        timeoutSettingsInSecs: z.object({
            createdToStarted: z.number().int().positive(),
            startedToCompleted: z.number().int().positive(),
            heartbeat: z.number().int().positive()
        }),
        args: argsUnion
    })
    .strict();

type ImmediateInput = z.infer<typeof entrySchema>;

export type ImmediateBatchResult = { taskId: string; retryKey: string } | { error: { code: 'duplicate_task_name' | 'task_cap_exceeded'; message: string } };

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
                    .array(entrySchema)
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

const handler = (scheduler: Scheduler) => {
    return async (_req: EndpointRequest, res: EndpointResponse<PostImmediateBatch>) => {
        const entries = res.locals.parsedBody.tasks;
        const propsList = entries.map((entry) => ({
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
        }));

        const batch = await scheduler.immediateBatch(propsList);
        if (batch.isErr()) {
            res.status(500).json({ error: { code: 'immediate_batch_failed', message: batch.error.message } });
            return;
        }

        // Scheduler returns duplicate drops per-entry; the orchestrator owns the metric.
        let duplicateCount = 0;
        const results: ImmediateBatchResult[] = batch.value.map((r) => {
            if (r.ok) {
                return { taskId: r.task.id, retryKey: r.task.retryKey! };
            }
            if (r.error === 'duplicate_task_name') {
                duplicateCount++;
            }
            const message = r.error === 'duplicate_task_name' ? 'Task with this name already exists' : 'Per-group task cap exceeded';
            return { error: { code: r.error, message } };
        });
        if (duplicateCount > 0) {
            metrics.increment(metrics.Types.ORCH_TASKS_DROPPED, duplicateCount, { reason: 'duplicate' });
        }
        res.status(200).json({ results });
    };
};

export const route: Route<PostImmediateBatch> = { path, method };

export const routeHandler = (scheduler: Scheduler): RouteHandler<PostImmediateBatch> => {
    return {
        ...route,
        validate,
        handler: handler(scheduler)
    };
};
