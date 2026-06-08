import { z } from 'zod';

import { defineTask } from '@nangohq/tasks';
import { Err, Ok, stringifyError } from '@nangohq/utils';

import { DeletionBudgetExceeded } from '../../crons/delete/batchDelete.js';
import { deleteSyncConfigData } from '../../crons/delete/deleteSyncConfigData.js';
import { tasks } from '../index.js';

import type { Result } from '@nangohq/utils';

const LIMIT = 100;
const BUDGET_SECONDS = 300;
const TIMEOUT_SECONDS = 600;
// Teardown isn't latency-sensitive; allow a long queue wait so a backlog doesn't expire it before it starts.
const CREATED_TO_STARTED_TIMEOUT_SECONDS = 86400;

/**
 * Async hard-delete that completes a function deletion. Drives `deleteSyncConfigData` on a time budget,
 * self-chaining a new task when the budget is reached.
 */
export const deleteFunctionTask = defineTask({
    type: 'deleteFunction',
    heartbeatTimeoutSecs: TIMEOUT_SECONDS,
    startedToCompletedTimeoutSecs: TIMEOUT_SECONDS,
    createdToStartedTimeoutSecs: CREATED_TO_STARTED_TIMEOUT_SECONDS,
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
                taskCtx.logger.info(`[tasks:deleteFunction] budget reached for sync_config ${syncConfigId}, chaining continuation`);

                const next = await tasks.enqueue('deleteFunction', payload);
                if (next.isErr()) {
                    return Err(next.error);
                }

                return Ok(undefined);
            }
            taskCtx.logger.error(`[tasks:deleteFunction] failed for sync_config ${syncConfigId}: ${stringifyError(err)}`);
            return Err(err instanceof Error ? err : new Error(`deleteFunction failed for sync_config ${syncConfigId}`));
        }
    }
});
