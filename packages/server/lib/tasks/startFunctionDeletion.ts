import { deleteSyncConfig, getSyncsBySyncConfigId, syncManager } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { tasks } from './index.js';
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
 * Enqueues the durable `deleteFunction` task, then soft-deletes the config and its syncs to stop
 * execution immediately.
 **/
export async function startFunctionDeletion({ syncConfigId, environmentId, models }: FunctionDeletionParams): Promise<Result<void>> {
    const res = await tasks.enqueue('deleteFunction', { syncConfigId, environmentId, models });
    // Only continue if enqueueing the task was successful.
    if (res.isErr()) {
        return Err(res.error);
    }

    // Fetch the live syncs before soft-deleting the config (the query requires an active config).
    const syncs = await getSyncsBySyncConfigId(environmentId, syncConfigId);
    for (const sync of syncs) {
        await syncManager.softDeleteSync(sync.id, environmentId, orchestrator);
    }

    await deleteSyncConfig(syncConfigId);

    return Ok(undefined);
}
