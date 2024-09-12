import db from '@nangohq/database';
import * as syncService from '../services/sync/sync.service.js';
import configService from '../services/config.service.js';
import type { Sync, SyncConfig } from '../models/Sync.js';
import type { Config as ProviderConfig } from '../models/Provider.js';

export const createSyncSeeds = async ({
    connectionId,
    envId,
    providerConfigKey,
    trackDeletes,
    models
}: {
    connectionId: number;
    envId: number;
    providerConfigKey: string;
    trackDeletes: boolean;
    models: string[];
}): Promise<{
    providerConfig: ProviderConfig;
    syncConfig: SyncConfig;
    sync: Sync;
}> => {
    const now = new Date();
    const providerConfig = await configService.createProviderConfig({
        unique_key: providerConfigKey,
        provider: Math.random().toString(36).substring(7),
        environment_id: envId,
        oauth_client_id: '',
        oauth_client_secret: '',
        created_at: now,
        updated_at: now
    });
    if (!providerConfig) throw new Error('Provider config not created');

    const [syncConfig] = await db.knex
        .from<SyncConfig>(`_nango_sync_configs`)
        .insert({
            environment_id: envId,
            sync_name: Math.random().toString(36).substring(7),
            type: 'sync',
            file_location: 'file_location',
            nango_config_id: providerConfig.id,
            version: '0',
            active: true,
            runs: 'runs',
            track_deletes: trackDeletes,
            auto_start: false,
            webhook_subscriptions: [],
            enabled: true,
            created_at: now,
            updated_at: now,
            models: models,
            model_schema: []
        } as SyncConfig)
        .returning('*');
    if (!syncConfig) throw new Error('Sync config not created');

    const sync = await syncService.createSync(connectionId, syncConfig);
    if (!sync) throw new Error('Sync not created');

    return {
        providerConfig,
        syncConfig,
        sync
    };
};

export const deleteAllSyncSeeds = async (): Promise<void> => {
    await db.knex.raw('TRUNCATE TABLE _nango_syncs CASCADE');
};
