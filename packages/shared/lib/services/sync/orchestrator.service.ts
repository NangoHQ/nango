import { deleteSyncConfig, deleteSyncFilesForConfig } from './config.service.js';
import { deleteScheduleForSync, deleteSchedulesBySyncId as deleteSyncSchedulesBySyncId } from './schedule.service.js';
import { deleteJobsBySyncId as deleteSyncJobsBySyncId } from './job.service.js';
import { deleteRecordsBySyncId as deleteSyncResultsBySyncId } from './data-records.service.js';
import { createSync, deleteSync, getSyncsByConnectionId, getSyncsByProviderConfigKey } from './sync.service.js';
import { createActivityLogMessage } from '../activity/activity.service.js';
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
    ): Promise<boolean> {
        try {
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

            return true;
        } catch (e) {
            const prettyError = JSON.stringify(e, ['message', 'name'], 2);
            await createActivityLogMessage({
                level: 'error',
                activity_log_id: activityLogId as number,
                timestamp: Date.now(),
                content: `Error starting syncs for ${syncName} with ${connections.length} connections: ${prettyError}`
            });

            return false;
        }
    }

    public async createSyncs(syncArgs: CreateSyncArgs[], debug = false, activityLogId?: number): Promise<boolean> {
        let success = true;
        for (const syncToCreate of syncArgs) {
            const { connections, providerConfigKey, environmentId, sync, syncName } = syncToCreate;
            const result = await this.create(connections, syncName, providerConfigKey, environmentId, sync, debug, activityLogId);
            if (!result) {
                success = false;
            }
        }

        return success;
    }

    /**
     * Delete
     * @desc delete a sync and all the related objects
     * 1) sync config files
     * 2) sync config
     */
    public async deleteConfig(syncConfigId: number, environmentId: number) {
        await deleteSyncFilesForConfig(syncConfigId, environmentId);
        await deleteSyncConfig(syncConfigId);
    }

    public async deleteSync(syncId: string, environmentId: number) {
        await deleteScheduleForSync(syncId as string, environmentId);
        await deleteSync(syncId as string);
    }

    public async deleteSyncRelatedObjects(syncId: string) {
        await deleteSyncJobsBySyncId(syncId);
        await deleteSyncSchedulesBySyncId(syncId);
        await deleteSyncResultsBySyncId(syncId);
    }

    public async deleteSyncsByConnection(connection: Connection) {
        const syncs = await getSyncsByConnectionId(connection.id as number);

        if (!syncs) {
            return;
        }
        for (const sync of syncs) {
            await this.deleteSync(sync.id as string, connection.environment_id as number);
        }
    }

    public async deleteSyncsByProviderConfig(environmentId: number, providerConfigKey: string) {
        const syncs = await getSyncsByProviderConfigKey(environmentId, providerConfigKey);

        if (!syncs) {
            return;
        }

        for (const sync of syncs) {
            await this.deleteSync(sync.id as string, environmentId);
        }
    }
}

export default new Orchestrator();
