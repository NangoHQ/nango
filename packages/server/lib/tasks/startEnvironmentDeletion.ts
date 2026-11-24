import db from '@nangohq/database';
import { environmentService } from '@nangohq/shared';
import { Err, Ok, report, stringifyError } from '@nangohq/utils';

import { tasks } from './index.js';

import type { Result } from '@nangohq/utils';

export interface EnvironmentDeletionParams {
    environmentId: number;
}

/**
 * Commits the environment soft-delete before enqueuing the durable `deleteEnvironment` task so the
 * worker never observes `deleted = false`. Restores the environment if enqueuing fails.
 */
export async function startEnvironmentDeletion(params: EnvironmentDeletionParams): Promise<Result<void>> {
    let softDeleted = false;
    try {
        const deleted = await environmentService.softDelete(db.knex, { environmentId: params.environmentId });
        if (deleted === 0) {
            return Ok(undefined); // Already deleted; no need to enqueue the delete task.
        }
        softDeleted = true;

        const res = await tasks.enqueue('deleteEnvironment', params);
        if (res.isErr()) {
            throw res.error;
        }

        return Ok(undefined);
    } catch (err) {
        if (softDeleted) {
            try {
                await environmentService.restoreSoftDeleted(db.knex, { environmentId: params.environmentId });
            } catch (restoreErr) {
                report(restoreErr, { environmentId: params.environmentId });
            }
        }
        return Err(err instanceof Error ? err : new Error(stringifyError(err)));
    }
}
