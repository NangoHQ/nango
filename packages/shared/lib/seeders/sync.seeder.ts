import db from '@nangohq/database';
import * as syncService from '../services/sync/sync.service.js';
import configService from '../services/config.service.js';
import type { Sync, SyncConfig } from '../models/Sync.js';

export const createSyncSeeds = async (connectionId: number, envId: number): Promise<Sync> => {
    const now = new Date();
    const providerConfig = await configService.createProviderConfig({
        unique_key: Math.random().toString(36).substring(7),
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
            version: '1',
            active: true,
            runs: 'runs',
            track_deletes: false,
            auto_start: false,
            webhook_subscriptions: [],
            enabled: true,
            created_at: now,
            updated_at: now,
            models: ['model'],
            model_schema: []
        } as SyncConfig)
        .returning('*');
    if (!syncConfig) throw new Error('Sync config not created');

    const sync = await syncService.createSync(connectionId, syncConfig);
    if (!sync) throw new Error('Sync not created');

    return sync;
};

export const deleteAllSyncSeeds = async (): Promise<void> => {
    await db.knex.raw('TRUNCATE TABLE _nango_syncs CASCADE');
};
