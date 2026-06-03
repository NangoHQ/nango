import { z } from 'zod';

import { deleteFunctionFiles } from '@nangohq/shared';
import { defineTask } from '@nangohq/task-queue';
import { Err, Ok } from '@nangohq/utils';

/** Deletes a function's compiled `.js` and source `.ts` artifacts from S3. */
export const deleteArtifactsTask = defineTask({
    type: 'deleteArtifacts',
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
            return Err(err instanceof Error ? err : new Error('Failed to delete function artifacts'));
        }
    }
});
