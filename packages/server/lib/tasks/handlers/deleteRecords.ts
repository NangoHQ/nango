import { z } from 'zod';

import { defineTask } from '@nangohq/tasks';
import { Err, Ok } from '@nangohq/utils';

import { DeletionBudgetExceeded } from '../../crons/delete/batchDelete.js';
import { deleteSyncRecords } from '../../crons/delete/deleteSyncRecords.js';
import { tasks } from '../index.js';

import type { Result } from '@nangohq/utils';

const BUDGET_SECONDS = 300;
const TIMEOUT_SECONDS = 600;
// Not latency-sensitive; allow a long queue wait so a backlog doesn't expire it before it starts.
const CREATED_TO_STARTED_TIMEOUT_SECONDS = 86400;

/**
 * Deletes a sync's records and emits the `usage.records` decrement (via `deleteSyncRecords`), on a time
 * budget, self-chaining a new task when the budget is reached.
 */
export const deleteRecordsTask = defineTask({
    type: 'deleteRecords',
    heartbeatTimeoutSecs: TIMEOUT_SECONDS,
    startedToCompletedTimeoutSecs: TIMEOUT_SECONDS,
    createdToStartedTimeoutSecs: CREATED_TO_STARTED_TIMEOUT_SECONDS,
    groupKey: (payload) => `deleteRecords:${payload.nangoConnectionId}`,
    schema: z.object({
        syncId: z.string().uuid(),
        nangoConnectionId: z.number(),
        environmentId: z.number(),
        models: z.array(z.string()),
        /** Latest job id + 1; scopes the deletion to this sync's records. */
        generation: z.number().int().positive()
    }),
    handle: async (payload, taskCtx): Promise<Result<void>> => {
        try {
            const deadline = new Date(Date.now() + BUDGET_SECONDS * 1000);
            await deleteSyncRecords(payload, { logger: taskCtx.logger, deadline });

            return Ok(undefined);
        } catch (err) {
            // Budget hit before draining every model — resume the rest on a fresh task.
            if (err instanceof DeletionBudgetExceeded) {
                taskCtx.logger.info(`[tasks:deleteRecords] budget reached for sync ${payload.syncId}, chaining continuation`);
                const next = await tasks.enqueue('deleteRecords', payload);
                if (next.isErr()) {
                    return Err(next.error);
                }
                return Ok(undefined);
            }
            return Err(new Error(`deleteRecords failed for sync ${payload.syncId}`, { cause: err }));
        }
    }
});
