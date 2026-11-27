import db from '@nangohq/database';
import { environmentService } from '@nangohq/shared';
import { Err, Ok, stringifyError } from '@nangohq/utils';

import { tasks } from './index.js';

import type { Result } from '@nangohq/utils';

export interface EnvironmentDeletionParams {
    environmentId: number;
}

/**
 * Soft-deletes the environment and enqueues the durable `deleteEnvironment` task under a
 * per-environment advisory lock. Serializes concurrent `DELETE` requests, rolls back the
 * soft-delete if enqueuing fails, and blocks `deleteEnvironmentTask` until this transaction
 * settles so the worker never reads a pre-commit `deleted = false` snapshot.
 *
 * Note: `tasks.enqueue` writes through its own pg pool rather than `trx`; if `trx` commit itself
 * fails after `enqueue` succeeds, `deleteEnvironmentTask` sees `deleted = false` and no-ops.
 */
export async function startEnvironmentDeletion(params: EnvironmentDeletionParams): Promise<Result<void>> {
    try {
        await db.knex.transaction(async (trx) => {
            await environmentService.acquireDeletionLock(trx, { environmentId: params.environmentId });

            const deleted = await environmentService.softDelete(trx, { environmentId: params.environmentId });
            if (deleted === 0) {
                return; // Already deleted; no need to enqueue the delete task.
            }

            const res = await tasks.enqueue('deleteEnvironment', params);
            if (res.isErr()) {
                throw res.error; // roll back the soft-delete
            }
        });

        return Ok(undefined);
    } catch (err) {
        return Err(err instanceof Error ? err : new Error(stringifyError(err)));
    }
}
