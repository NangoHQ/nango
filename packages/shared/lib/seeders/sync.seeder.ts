import db from '@nangohq/database';
import * as syncService from '../services/sync/sync.service.js';
import type { Sync, SyncConfig } from '../models/Sync.js';
import type { DBSyncEndpoint, NangoSyncEndpointV2 } from '@nangohq/types';
import type { SetRequired } from 'type-fest';

export async function createSyncSeeds({
    connectionId,
    endpoints,
    ...syncData
}: SetRequired<Partial<SyncConfig>, 'environment_id' | 'nango_config_id' | 'sync_name'> & {
    connectionId: number;
    endpoints?: NangoSyncEndpointV2[];
}): Promise<{
    syncConfig: SyncConfig;
    sync: Sync;
}> {
    const now = new Date();

    const [syncConfig] = await db.knex
        .from<SyncConfig>(`_nango_sync_configs`)
        .insert({
            environment_id: syncData.environment_id,
            sync_name: syncData.sync_name,
            type: syncData.type || 'sync',
            file_location: 'file_location',
            nango_config_id: syncData.nango_config_id,
            version: syncData.version || '0.0.0',
            active: true,
            runs: 'runs',
            track_deletes: syncData.track_deletes === true,
            auto_start: syncData.auto_start === true,
            webhook_subscriptions: [],
            enabled: true,
            created_at: now,
            updated_at: now,
            models: syncData.models || [],
            model_schema: []
        })
        .returning('*');
    if (!syncConfig) {
        throw new Error('Sync config not created');
    }

    const sync = await syncService.createSync(connectionId, syncConfig);
    if (!sync) {
        throw new Error('Sync not created');
    }

    if (endpoints && endpoints.length > 0) {
        await db.knex.from<DBSyncEndpoint>('_nango_sync_endpoints').insert(
            endpoints.map((endpoint) => {
                return {
                    method: endpoint.method,
                    path: endpoint.path,
                    group_name: endpoint.group || null,
                    sync_config_id: syncConfig.id!
                };
            })
        );
    }

    return { syncConfig, sync };
}
