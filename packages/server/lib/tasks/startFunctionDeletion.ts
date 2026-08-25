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
 * Soft-deletes the config and enqueues the durable `deleteFunction` task.
 * The delete task is a no-op if the config is not soft-deleted (by eg. a transaction rollback).
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
