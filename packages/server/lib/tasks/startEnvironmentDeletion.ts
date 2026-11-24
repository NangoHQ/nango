import db from '@nangohq/database';
import { environmentService } from '@nangohq/shared';
import { Err, Ok, stringifyError } from '@nangohq/utils';

import { tasks } from './index.js';

import type { Result } from '@nangohq/utils';

// `tasks` writes through its own pg pool; deferring initial pickup ensures the outer knex
// transaction has committed `deleted = true` before the worker checks the environment row.
const INITIAL_DELAY_MS = 2_000;

export interface EnvironmentDeletionParams {
    environmentId: number;
}

/**
 * Soft-deletes the environment and enqueues the durable `deleteEnvironment` task.
 * Rolls back the soft-delete if enqueuing fails; the task is a no-op if the soft-delete rolls back.
 */
export async function startEnvironmentDeletion(params: EnvironmentDeletionParams): Promise<Result<void>> {
    try {
        await db.knex.transaction(async (trx) => {
            const deleted = await environmentService.softDelete(trx, { environmentId: params.environmentId });
            if (deleted === 0) {
                return; // Already deleted; no need to enqueue the delete task.
            }

            const res = await tasks.enqueue('deleteEnvironment', params, {
                startsAfter: new Date(Date.now() + INITIAL_DELAY_MS)
            });
            if (res.isErr()) {
                throw res.error; // roll back the soft-delete
            }
        });
        return Ok(undefined);
    } catch (err) {
        return Err(err instanceof Error ? err : new Error(stringifyError(err)));
    }
}
