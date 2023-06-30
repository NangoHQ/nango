import { deleteSyncConfig, deleteSyncFilesForConfig } from './config.service.js';
import { deleteScheduleForSync } from './schedule.service.js';
import { createSync, deleteSync } from './sync.service.js';
import SyncClient from '../../clients/sync.client.js';
import configService from '../config.service.js';
import type { Connection } from '../../models/Connection.js';
import type { Config as ProviderConfig } from '../../models/Provider.js';
import type { IncomingSyncConfig, Sync } from '../../models/Sync.js';

export class Orchestrator {
    public async create(connection: Connection, syncName: string, models: string[], providerConfigKey: string, accountId: number, sync: IncomingSyncConfig) {
        const createdSync = await createSync(connection.id as number, syncName, models);
        const syncConfig = await configService.getProviderConfig(providerConfigKey, accountId);
        const syncClient = await SyncClient.getInstance();
        syncClient?.startContinuous(connection, createdSync as Sync, syncConfig as ProviderConfig, syncName, { ...sync, returns: sync.models });
    }

    /**
     * Delete
     * @desc delete a sync and all the related objects
     * 1) sync config files
     * 2) sync config
     * 3) sync schedule
     * 4) sync and that will cascade to other tables
     */
    public async delete(syncConfigId: number, syncId?: string) {
        /* 1. */ await deleteSyncFilesForConfig(syncConfigId);
        /* 2. */ await deleteSyncConfig(syncConfigId);
        if (syncId) {
            /* 3. */ await deleteScheduleForSync(syncId as string);
            /* 4. */ await deleteSync(syncId as string);
        }
    }
}

export default new Orchestrator();
