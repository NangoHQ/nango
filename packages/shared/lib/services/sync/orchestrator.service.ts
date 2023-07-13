import { deleteSyncConfig, deleteSyncFilesForConfig } from './config.service.js';
import { deleteScheduleForSync } from './schedule.service.js';
import { createSync, deleteSync } from './sync.service.js';
import { createActivityLogMessage } from '../activity.service.js';
import SyncClient from '../../clients/sync.client.js';
import configService from '../config.service.js';
import type { Connection } from '../../models/Connection.js';
import type { Config as ProviderConfig } from '../../models/Provider.js';
import type { IncomingSyncConfig, Sync } from '../../models/Sync.js';

interface CreateSyncArgs {
    connections: Connection[];
    providerConfigKey: string;
    environmentId: number;
    sync: IncomingSyncConfig;
    syncName: string;
}

export class Orchestrator {
    public async create(
        connections: Connection[],
        syncName: string,
        providerConfigKey: string,
        environmentId: number,
        sync: IncomingSyncConfig,
        debug = false,
        activityLogId?: number
    ) {
        const syncConfig = await configService.getProviderConfig(providerConfigKey, environmentId);
        if (debug && activityLogId) {
            await createActivityLogMessage({
                level: 'debug',
                activity_log_id: activityLogId as number,
                timestamp: Date.now(),
                content: `Beginning iteration of starting syncs for ${syncName} with ${connections.length} connections`
            });
        }
        for (const connection of connections) {
            const createdSync = await createSync(connection.id as number, syncName);
            const syncClient = await SyncClient.getInstance();
            await syncClient?.startContinuous(
                connection,
                createdSync as Sync,
                syncConfig as ProviderConfig,
                syncName,
                { ...sync, returns: sync.models },
                debug
            );
        }
        if (debug && activityLogId) {
            await createActivityLogMessage({
                level: 'debug',
                activity_log_id: activityLogId as number,
                timestamp: Date.now(),
                content: `Finished iteration of starting syncs for ${syncName} with ${connections.length} connections`
            });
        }
    }

    public async createSyncs(syncArgs: CreateSyncArgs[], debug = false, activityLogId?: number) {
        for (const syncToCreate of syncArgs) {
            const { connections, providerConfigKey, environmentId, sync, syncName } = syncToCreate;
            await this.create(connections, syncName, providerConfigKey, environmentId, sync, debug, activityLogId);
        }
    }

    /**
     * Delete
     * @desc delete a sync and all the related objects
     * 1) sync config files
     * 2) sync config
     */
    public async deleteConfig(syncConfigId: number) {
        await deleteSyncFilesForConfig(syncConfigId);
        await deleteSyncConfig(syncConfigId);
    }

    public async deleteSync(syncId: string) {
        await deleteScheduleForSync(syncId as string);
        await deleteSync(syncId as string);
    }
}

export default new Orchestrator();
