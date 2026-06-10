import { deleteSyncConfig } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { tasks } from './index.js';

import type { Result } from '@nangohq/utils';

export interface FunctionDeletionParams {
    syncConfigId: number;
    environmentId: number;
    /** Models the function produces (record deletion is per model). Empty for actions. */
    models: string[];
}

/**
 * Enqueues the durable `deleteFunction` task and soft-deletes the config. Soft-deleting the config
 * neutralizes execution immediately (a scheduled run loads the config, finds it gone, and bails);
 * the task then unschedules (in bulk, per batch) and hard-deletes the syncs (and their active error
 * notifications). O(1) so it scales to functions with millions of connections.
 **/
export async function startFunctionDeletion({ syncConfigId, environmentId, models }: FunctionDeletionParams): Promise<Result<void>> {
    const res = await tasks.enqueue('deleteFunction', { syncConfigId, environmentId, models });
    // Only continue if enqueueing the task was successful.
    if (res.isErr()) {
        return Err(res.error);
    }

    await deleteSyncConfig(syncConfigId);

    return Ok(undefined);
}
