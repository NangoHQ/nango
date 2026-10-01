import { z } from 'zod';

import db from '@nangohq/database';
import { deleteFunctionFiles, functionConfigService } from '@nangohq/shared';
import { defineTask } from '@nangohq/tasks';
import { Err, Ok, stringifyError } from '@nangohq/utils';

// Artifact deletion is not latency-sensitive.
// Allow a long queue wait so a task doesn't expire before it starts.
const CREATED_TO_STARTED_TIMEOUT_SECONDS = 86400;

// Deletes a new function's compiled `.js` and source `.ts` artifacts from storage.
export const deleteFunctionArtifactsTask = defineTask({
    type: 'deleteFunctionArtifacts',
    createdToStartedTimeoutSecs: CREATED_TO_STARTED_TIMEOUT_SECONDS,
    schema: z.object({
        environmentId: z.number(),
        fileLocations: z.array(z.string())
    }),
    handle: async (payload, ctx) => {
        try {
            const deletable = await functionConfigService.safeToDeleteArtifacts(db.knex, {
                environmentId: payload.environmentId,
                fileLocations: payload.fileLocations
            });
            if (deletable.isErr()) {
                return Err(deletable.error);
            }

            await deleteFunctionFiles(deletable.value);

            ctx.logger.info(`[tasks:deleteFunctionArtifacts] deleted ${deletable.value.length} artifact(s)`);

            return Ok(undefined);
        } catch (err) {
            ctx.logger.error(`[tasks:deleteFunctionArtifacts] failed to delete artifact(s): ${stringifyError(err)}`);
            return Err(err instanceof Error ? err : new Error('Failed to delete function artifacts'));
        }
    }
});
