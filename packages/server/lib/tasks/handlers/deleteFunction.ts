import { z } from 'zod';

import db from '@nangohq/database';
import { functionConfigService, getSyncConfigById } from '@nangohq/shared';
import { defineTask } from '@nangohq/tasks';
import { Err, Ok, stringifyError } from '@nangohq/utils';

import { DeletionBudgetExceeded } from '../../deletion/batchDelete.js';
import { deleteFunctionConfigData } from '../../deletion/deleteFunctionConfigData.js';
import { deleteSyncConfigData } from '../../deletion/deleteSyncConfigData.js';
import { tasks } from '../index.js';

import type { Result } from '@nangohq/utils';

const LIMIT = 100;
const BUDGET_SECONDS = 300;
const TIMEOUT_SECONDS = 600;
// Teardown isn't latency-sensitive; allow a long queue wait so a backlog doesn't expire it before it starts.
const CREATED_TO_STARTED_TIMEOUT_SECONDS = 86400;

/**
 * Async hard-delete that completes a legacy or native function deletion on a time budget,
 * self-chaining a new task when the budget is reached.
 */
export const deleteFunctionTask = defineTask({
    type: 'deleteFunction',
    heartbeatTimeoutSecs: TIMEOUT_SECONDS,
    startedToCompletedTimeoutSecs: TIMEOUT_SECONDS,
    createdToStartedTimeoutSecs: CREATED_TO_STARTED_TIMEOUT_SECONDS,
    schema: z.union([
        z.object({ syncConfigId: z.number(), environmentId: z.number(), models: z.array(z.string()) }).strict(),
        z.object({ functionConfigId: z.number(), environmentId: z.number() }).strict()
    ]),
    handle: async (payload, taskCtx): Promise<Result<void>> => {
        const target = 'syncConfigId' in payload ? `sync_config ${payload.syncConfigId}` : `function_config ${payload.functionConfigId}`;

        try {
            const opts = { deadline: new Date(Date.now() + BUDGET_SECONDS * 1000), limit: LIMIT, logger: taskCtx.logger, sleepMs: 0 };
            if ('syncConfigId' in payload) {
                const liveConfig = await getSyncConfigById(payload.environmentId, payload.syncConfigId);
                if (liveConfig) {
                    taskCtx.logger.warning(`[tasks:deleteFunction] ${target} is not soft-deleted; skipping teardown`);
                    return Ok(undefined);
                }
                await deleteSyncConfigData(payload, opts);
            } else {
                const found = await functionConfigService.search(
                    db.knex,
                    { environmentId: payload.environmentId, filter: { id: payload.functionConfigId } },
                    { includeDeleted: true }
                );
                if (found.isErr()) {
                    throw found.error;
                }
                const fn = found.value[0];
                if (!fn) {
                    return Ok(undefined);
                }
                if (fn.config.deleted_at === null) {
                    taskCtx.logger.warning(`[tasks:deleteFunction] ${target} is not soft-deleted; skipping teardown`);
                    return Ok(undefined);
                }
                await deleteFunctionConfigData(fn.config, opts);
            }

            return Ok(undefined);
        } catch (err) {
            // If we reach the time budget limit, we're not done. Continue on new task.
            if (err instanceof DeletionBudgetExceeded) {
                taskCtx.logger.info(`[tasks:deleteFunction] budget reached for ${target}, chaining continuation`);

                const next = await tasks.enqueue('deleteFunction', payload);
                if (next.isErr()) {
                    return Err(next.error);
                }

                return Ok(undefined);
            }
            taskCtx.logger.error(`[tasks:deleteFunction] failed for ${target}: ${stringifyError(err)}`);
            return Err(err instanceof Error ? err : new Error(`deleteFunction failed for ${target}`));
        }
    }
});
