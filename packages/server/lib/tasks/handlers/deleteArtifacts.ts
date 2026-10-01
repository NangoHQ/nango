import { z } from 'zod';

import { deleteFunctionFiles } from '@nangohq/shared';
import { defineTask } from '@nangohq/tasks';
import { Err, Ok, stringifyError } from '@nangohq/utils';

// artifact deletion is NOT latency-sensitive.
// Allow a long queue wait so a task doesn't expire it before it starts.
const CREATED_TO_STARTED_TIMEOUT_SECONDS = 86400;

// Deletes a function's compiled `.js` and source `.ts` artifacts from storage.
export const deleteArtifactsTask = defineTask({
    type: 'deleteArtifacts',
    createdToStartedTimeoutSecs: CREATED_TO_STARTED_TIMEOUT_SECONDS,
    schema: z.object({
        environmentId: z.number(),
        fileLocations: z.array(z.string())
    }),
    handle: async (payload, ctx) => {
        try {
            await deleteFunctionFiles(payload.fileLocations);

            ctx.logger.info(`[tasks:deleteArtifacts] deleted ${payload.fileLocations.length} artifact(s)`);

            return Ok(undefined);
        } catch (err) {
            ctx.logger.error(`[tasks:deleteArtifacts] failed to delete artifact(s): ${stringifyError(err)}`);
            return Err(err instanceof Error ? err : new Error('Failed to delete function artifacts'));
        }
    }
});
