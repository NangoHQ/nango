import db from '@nangohq/database';
import { deleteSyncConfig, functionConfigService } from '@nangohq/shared';
import { Err, Ok, stringifyError } from '@nangohq/utils';

import { tasks } from './index.js';

import type { Result } from '@nangohq/utils';

export type FunctionDeletionParams =
    | {
          syncConfigId: number;
          environmentId: number;
          /** Models the function produces (record deletion is per model). Empty for actions. */
          models: string[];
      }
    | {
          functionConfigId: number;
          environmentId: number;
      };

/**
 * Soft-deletes the config and enqueues the durable `deleteFunction` task.
 * The delete task is a no-op if the config is not soft-deleted (by eg. a transaction rollback).
 **/
export async function startFunctionDeletion(params: FunctionDeletionParams): Promise<Result<void>> {
    try {
        await db.knex.transaction(async (trx) => {
            if ('syncConfigId' in params) {
                await deleteSyncConfig(params.syncConfigId, trx);
            } else {
                const deleted = await functionConfigService.softDelete(trx, {
                    environmentId: params.environmentId,
                    ids: [params.functionConfigId]
                });
                if (deleted.isErr()) {
                    throw deleted.error;
                }
                if (deleted.value === 0) {
                    return; // Already deleted. No need to enqueue the delete task.
                }
            }

            // TODO: fix race condition where the task is enqueued before the transaction commits.
            // The task then runs before the soft-delete is visible to it. causing the delete task to be a no-op
            // and leave the function in a soft-deleted state indefinitely.
            const res = await tasks.enqueue('deleteFunction', params);
            if (res.isErr()) {
                throw res.error; // roll back the soft-delete
            }
        });
        return Ok(undefined);
    } catch (err) {
        return Err(err instanceof Error ? err : new Error(stringifyError(err)));
    }
}
