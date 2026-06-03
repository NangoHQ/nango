import { z } from 'zod';

import { defineTask } from '@nangohq/task-queue';
import { Err, Ok } from '@nangohq/utils';

import { deleteSyncRecords } from '../../crons/delete/deleteSyncRecords.js';

import type { Result } from '@nangohq/utils';

// deleteOutdatedRecords loops internally over the (separate, optimized) records DB; no self-chain.
const TIMEOUT_SECONDS = 600;

/**
 * Deletes a sync's records (optimized `deleteOutdatedRecords` path) and emits the `usage.records`
 * billing decrement. `generation` (the sync's latest job id + 1) scopes the deletion to that sync.
 * A thin wrapper around `deleteSyncRecords`, which does the deletion + emission.
 */
export const deleteRecordsTask = defineTask({
    type: 'deleteRecords',
    heartbeatTimeoutSecs: TIMEOUT_SECONDS,
    startedToCompletedTimeoutSecs: TIMEOUT_SECONDS,
    groupKey: (payload) => `deleteRecords:${payload.nangoConnectionId}`,
    schema: z.object({
        syncId: z.string().uuid(),
        nangoConnectionId: z.number(),
        environmentId: z.number(),
        models: z.array(z.string()),
        /** Latest `_nango_sync_jobs.id` + 1: deleteOutdatedRecords keeps records seen at >= generation. */
        generation: z.number()
    }),
    handle: async (payload, taskCtx): Promise<Result<void>> => {
        try {
            await deleteSyncRecords(payload, { logger: taskCtx.logger });
            return Ok(undefined);
        } catch (err) {
            return Err(err instanceof Error ? err : new Error(`deleteRecords failed for sync ${payload.syncId}`));
        }
    }
});
