import { z } from 'zod';

import { defineTask } from '@nangohq/task-queue';
import { Err, Ok } from '@nangohq/utils';

import { deleteSyncRecords } from '../../crons/delete/deleteSyncRecords.js';

import type { Result } from '@nangohq/utils';

const TIMEOUT_SECONDS = 600;

/** Deletes a sync's records and emits the `usage.records` decrement. Thin wrapper around `deleteSyncRecords`. */
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
        /** Latest job id + 1; scopes the deletion to this sync's records. */
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
