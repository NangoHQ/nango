import { z } from 'zod';

import db from '@nangohq/database';
import { environmentService } from '@nangohq/shared';
import { defineTask } from '@nangohq/tasks';
import { Err, Ok, stringifyError } from '@nangohq/utils';

import { DeletionBudgetExceeded } from '../../deletion/batchDelete.js';
import { deleteEnvironmentData } from '../../deletion/deleteEnvironmentData.js';
import { tasks } from '../index.js';

import type { DBEnvironment } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const LIMIT = 100;
const BUDGET_SECONDS = 300;
const TIMEOUT_SECONDS = 600;
// Teardown isn't latency-sensitive; allow a long queue wait so a backlog doesn't expire it before it starts.
const CREATED_TO_STARTED_TIMEOUT_SECONDS = 86400;

/**
 * Async hard-delete that completes an environment deletion on a time budget,
 * self-chaining a continuation task when the budget is reached.
 */
export const deleteEnvironmentTask = defineTask({
    type: 'deleteEnvironment',
    heartbeatTimeoutSecs: TIMEOUT_SECONDS,
    startedToCompletedTimeoutSecs: TIMEOUT_SECONDS,
    createdToStartedTimeoutSecs: CREATED_TO_STARTED_TIMEOUT_SECONDS,
    groupKey: (payload) => `deleteEnvironment:${payload.environmentId}`,
    groupMaxConcurrency: 1,
    schema: z.object({ environmentId: z.number() }).strict(),
    handle: async (payload, taskCtx): Promise<Result<void>> => {
        const target = `environment ${payload.environmentId}`;

        try {
            const environment = await db.knex.transaction(async (trx) => {
                await environmentService.acquireDeletionLock(trx, { environmentId: payload.environmentId });
                return await trx<DBEnvironment>('_nango_environments').where({ id: payload.environmentId }).first();
            });
            if (!environment) {
                return Ok(undefined);
            }
            if (!environment.deleted) {
                taskCtx.logger.warning(`[tasks:deleteEnvironment] ${target} is not soft-deleted; skipping teardown`);
                return Ok(undefined);
            }

            const opts = { deadline: new Date(Date.now() + BUDGET_SECONDS * 1000), limit: LIMIT, logger: taskCtx.logger, sleepMs: 0 };
            await deleteEnvironmentData(environment, opts);

            return Ok(undefined);
        } catch (err) {
            if (err instanceof DeletionBudgetExceeded) {
                taskCtx.logger.info(`[tasks:deleteEnvironment] budget reached for ${target}, chaining continuation`);

                const next = await tasks.enqueue('deleteEnvironment', payload);
                if (next.isErr()) {
                    return Err(next.error);
                }

                return Ok(undefined);
            }
            taskCtx.logger.error(`[tasks:deleteEnvironment] failed for ${target}: ${stringifyError(err)}`);
            return Err(err instanceof Error ? err : new Error(`deleteEnvironment failed for ${target}`));
        }
    }
});
