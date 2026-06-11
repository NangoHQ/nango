import db from '@nangohq/database';
import { deleteSyncConfig } from '@nangohq/shared';
import { Err, Ok, stringifyError } from '@nangohq/utils';

import { tasks } from './index.js';

import type { Result } from '@nangohq/utils';

export interface FunctionDeletionParams {
    syncConfigId: number;
    environmentId: number;
    /** Models the function produces (record deletion is per model). Empty for actions. */
    models: string[];
}

/**
 * Soft-deletes the config and enqueues the durable `deleteFunction` task atomically. The soft-delete (which
 * stops execution immediately — a scheduled run loads the config, finds it gone, and bails) runs inside a
 * transaction, and a failed enqueue throws so the transaction rolls it back: we never end up with a function
 * marked deleted but no teardown scheduled.
 *
 * The enqueue uses its own DB connection, so it isn't part of the transaction — but on failure there's no task
 * to undo (the insert failed), so rolling back the soft-delete cleanly leaves "nothing happened". The task then
 * unschedules (bulk) and hard-deletes the syncs. O(1) so it scales to functions with millions of connections.
 **/
export async function startFunctionDeletion({ syncConfigId, environmentId, models }: FunctionDeletionParams): Promise<Result<void>> {
    try {
        await db.knex.transaction(async (trx) => {
            await deleteSyncConfig(syncConfigId, trx);

            const res = await tasks.enqueue('deleteFunction', { syncConfigId, environmentId, models });
            if (res.isErr()) {
                throw res.error; // roll back the soft-delete
            }
        });
        return Ok(undefined);
    } catch (err) {
        return Err(err instanceof Error ? err : new Error(stringifyError(err)));
    }
}
