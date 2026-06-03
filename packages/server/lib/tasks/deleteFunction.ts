import { deleteSyncConfig, getSyncsBySyncConfigId, syncManager } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { taskQueue } from './index.js';
import { getOrchestrator } from '../utils/utils.js';

import type { Result } from '@nangohq/utils';

const orchestrator = getOrchestrator();

export interface FunctionDeletionParams {
    syncConfigId: number;
    environmentId: number;
    /** Models the function produces (record deletion is per model). Empty for actions. */
    models: string[];
}

/**
 * Soft deletes the sync config and all of the syncs associated with it.
 * Then enqueues the `teardownFunction` task to handle the full cleanup and hard deletion.
 **/
export async function deleteFunction({ syncConfigId, environmentId, models }: FunctionDeletionParams): Promise<Result<void>> {
    // Fetch the live syncs before soft-deleting the config (the query requires an active config).
    const syncs = await getSyncsBySyncConfigId(environmentId, syncConfigId);
    for (const sync of syncs) {
        await syncManager.softDeleteSync(sync.id, environmentId, orchestrator);
    }

    await deleteSyncConfig(syncConfigId);

    const res = await taskQueue.enqueue('teardownFunction', { syncConfigId, environmentId, models });
    if (res.isErr()) {
        return Err(res.error);
    }

    return Ok(undefined);
}
