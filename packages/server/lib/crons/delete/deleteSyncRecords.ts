import { records } from '@nangohq/records';
import { connectionService, environmentService, pubsub } from '@nangohq/shared';

import type { StrictLogger } from '@nangohq/utils';

/**
 * Deletes a sync's records (separate datastore, a hot path) for each of its models via the optimized
 * `deleteOutdatedRecords` query, and publishes the negative `usage.records` billing event per model.
 *
 * `generation` is the sync's latest `_nango_sync_jobs.id` + 1: records are kept only when seen at
 * `sync_job_id >= generation`, so generation = lastJobId + 1 deletes all of the sync's records as of
 * the deletion. Billing context is resolved here (best-effort: if the connection/environment is already
 * gone — e.g. at retention — records are still deleted, emission is skipped). Idempotent: a re-run
 * deletes nothing more, so it emits nothing more.
 */
export async function deleteSyncRecords(
    {
        syncId,
        nangoConnectionId,
        environmentId,
        models,
        generation
    }: { syncId: string; nangoConnectionId: number; environmentId: number; models: string[]; generation: number },
    { logger }: { logger: StrictLogger }
): Promise<void> {
    const [connection, environment] = await Promise.all([connectionService.getConnectionById(nangoConnectionId), environmentService.getById(environmentId)]);
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
        const res = await records.deleteOutdatedRecords({ environmentId, connectionId: nangoConnectionId, model, generation });
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
