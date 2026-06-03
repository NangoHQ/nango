import { z } from 'zod';

import { defineTask } from '@nangohq/task-queue';
import { Err, Ok } from '@nangohq/utils';

import { DeletionBudgetExceeded } from '../../crons/delete/batchDelete.js';
import { deleteSyncConfigData } from '../../crons/delete/deleteSyncConfigData.js';
import { taskQueue } from '../index.js';

import type { Result } from '@nangohq/utils';

const LIMIT = 100;
const BUDGET_SECONDS = 300;
const TIMEOUT_SECONDS = 600;

/**
 * Function teardown task: the async, durable hard-delete that completes a function deletion started by
 * `deleteFunction`. Calls `deleteSyncConfigData` on a time budget; if the budget is reached, self-chains
 * on a new task.
 */
export const teardownFunctionTask = defineTask({
    type: 'teardownFunction',
    heartbeatTimeoutSecs: TIMEOUT_SECONDS,
    startedToCompletedTimeoutSecs: TIMEOUT_SECONDS,
    schema: z.object({
        syncConfigId: z.number(),
        environmentId: z.number(),
        models: z.array(z.string())
    }),
    handle: async (payload, taskCtx): Promise<Result<void>> => {
        const { syncConfigId, environmentId, models } = payload;

        try {
            await deleteSyncConfigData(
                { syncConfigId, environmentId, models },
                { deadline: new Date(Date.now() + BUDGET_SECONDS * 1000), limit: LIMIT, logger: taskCtx.logger, sleepMs: 0 }
            );

            return Ok(undefined);
        } catch (err) {
            // If we reach the time budget limit, we're not done. Continue on new task.
            if (err instanceof DeletionBudgetExceeded) {
                taskCtx.logger.info(`[tasks:teardownFunction] budget reached for sync_config ${syncConfigId}, chaining continuation`);

                const next = await taskQueue.enqueue('teardownFunction', payload);
                if (next.isErr()) {
                    return Err(next.error);
                }

                return Ok(undefined);
            }
            return Err(err instanceof Error ? err : new Error(`teardownFunction failed for sync_config ${syncConfigId}`));
        }
    }
});
