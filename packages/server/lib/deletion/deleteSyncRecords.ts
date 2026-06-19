import db from '@nangohq/database';
import { records } from '@nangohq/records';
import { connectionService, environmentService, getPlanSafe, pubsub } from '@nangohq/shared';

import { DeletionBudgetExceeded } from './batchDelete.js';

import type { StrictLogger } from '@nangohq/utils';

/**
 * Deletes a sync's records per model via `deleteOutdatedRecords` and publishes a negative `usage.records`
 * event per model. `generation` (the sync's latest job id + 1) scopes the deletion to this sync.
 */
export async function deleteSyncRecords(
    {
        syncId,
        nangoConnectionId,
        environmentId,
        models,
        generation
    }: { syncId: string; nangoConnectionId: number; environmentId: number; models: string[]; generation: number },
    { logger, deadline }: { logger: StrictLogger; deadline?: Date }
): Promise<void> {
    const [connection, environment, plan] = await Promise.all([
        connectionService.getConnectionById(nangoConnectionId),
        environmentService.getById(environmentId),
        getPlanSafe(db.knex, { environmentId })
    ]);
    const usageProps =
        connection && environment
            ? {
                  accountId: environment.account_id,
                  environmentId,
                  environmentName: environment.name,
                  integrationId: connection.provider_config_key,
                  connectionId: connection.connection_id,
                  syncId
              }
            : null;
    if (!usageProps) {
        logger.warning(`[deleteSyncRecords] missing connection/environment for sync ${syncId}; deleting records without billing emission`);
    }

    for (const model of models) {
        if (deadline && Date.now() > deadline.getTime()) {
            throw new DeletionBudgetExceeded();
        }

        const res = await records.deleteOutdatedRecords({ environmentId, connectionId: nangoConnectionId, model, generation, plan });
        if (res.isErr()) {
            throw res.error;
        }

        const count = res.value.length;
        if (count > 0) {
            logger.info(`Deleted ${count} ${model} records`);
            if (usageProps) {
                void pubsub.publisher.publish({ subject: 'usage', type: 'usage.records', payload: { value: -count, properties: { ...usageProps, model } } });
            }
        }
    }
}
