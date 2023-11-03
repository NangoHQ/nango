import { deleteSyncConfig, deleteSyncFilesForConfig } from './config/config.service.js';
import connectionService from '../connection.service.js';
import { deleteScheduleForSync, deleteSchedulesBySyncId as deleteSyncSchedulesBySyncId, getSchedule, updateScheduleStatus } from './schedule.service.js';
import { deleteJobsBySyncId as deleteSyncJobsBySyncId, getLatestSyncJob } from './job.service.js';
import { deleteRecordsBySyncId as deleteSyncResultsBySyncId } from './data/records.service.js';
import {
    createSync,
    deleteSync,
    getSyncsByConnectionId,
    getSyncsByProviderConfigKey,
    getSyncsByProviderConfigAndSyncNames,
    getSyncByIdAndName
} from './sync.service.js';
import {
    createActivityLogMessageAndEnd,
    createActivityLog,
    createActivityLogMessage,
    updateSuccess as updateSuccessActivityLog
} from '../activity/activity.service.js';
import SyncClient from '../../clients/sync.client.js';
import configService from '../config.service.js';
import type { LogLevel } from '../../models/Activity.js';
import type { Connection } from '../../models/Connection.js';
import type { Config as ProviderConfig } from '../../models/Provider.js';
import {
    SyncStatus,
    ScheduleStatus,
    SyncConfigType,
    SyncDeploymentResult,
    IncomingSyncConfig,
    Sync,
    SyncCommand,
    CommandToActivityLog,
    ReportedSyncJobStatus
} from '../../models/Sync.js';

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
                    environment_id: environmentId,
                    activity_log_id: activityLogId as number,
                    timestamp: Date.now(),
                    content: `Beginning iteration of starting syncs for ${syncName} with ${connections.length} connections`
                });
            }
            for (const connection of connections) {
                const syncExists = await getSyncByIdAndName(connection.id as number, syncName);

                if (syncExists) {
                    continue;
                }

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
                    environment_id: environmentId,
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
                environment_id: environmentId,
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

    public async runSyncCommand(environmentId: number, providerConfigKey: string, syncNames: string[], command: SyncCommand, connectionId?: string) {
        const action = CommandToActivityLog[command];
        const provider = await configService.getProviderName(providerConfigKey as string);

        const log = {
            level: 'info' as LogLevel,
            success: false,
            action,
            start: Date.now(),
            end: Date.now(),
            timestamp: Date.now(),
            connection_id: connectionId || '',
            provider,
            provider_config_key: providerConfigKey as string,
            environment_id: environmentId
        };
        const activityLogId = await createActivityLog(log);

        if (connectionId) {
            const {
                success,
                error,
                response: connection
            } = await connectionService.getConnection(connectionId as string, providerConfigKey as string, environmentId);

            if (!success) {
                throw error;
            }

            for (const syncName of syncNames) {
                const sync = await getSyncByIdAndName(connection?.id as number, syncName);
                if (!sync) {
                    continue;
                }
                const schedule = await getSchedule(sync?.id as string);

                const syncClient = await SyncClient.getInstance();
                await syncClient?.runSyncCommand(schedule?.schedule_id as string, sync?.id as string, command, activityLogId as number, environmentId);
                // if they're triggering a sync that shouldn't change the schedule status
                if (command !== SyncCommand.RUN) {
                    await updateScheduleStatus(schedule?.schedule_id as string, command, activityLogId as number, environmentId);
                }
            }
            await createActivityLogMessageAndEnd({
                level: 'info',
                environment_id: environmentId,
                activity_log_id: activityLogId as number,
                timestamp: Date.now(),
                content: `Sync was updated with command: "${action}" for sync: ${syncNames.join(', ')}`
            });
        } else {
            const syncs =
                syncNames.length > 0
                    ? await getSyncsByProviderConfigAndSyncNames(environmentId, providerConfigKey, syncNames)
                    : await getSyncsByProviderConfigKey(environmentId, providerConfigKey);

            if (!syncs) {
                return;
            }

            for (const sync of syncs) {
                const schedule = await getSchedule(sync?.id as string);
                const syncClient = await SyncClient.getInstance();
                await syncClient?.runSyncCommand(schedule?.schedule_id as string, sync?.id as string, command, activityLogId as number, environmentId);
                if (command !== SyncCommand.RUN) {
                    await updateScheduleStatus(schedule?.schedule_id as string, command, activityLogId as number, environmentId);
                }
            }
            await createActivityLogMessageAndEnd({
                level: 'info',
                environment_id: environmentId,
                activity_log_id: activityLogId as number,
                timestamp: Date.now(),
                content: `Sync was updated with command: "${action}" for sync: ${syncNames.join(', ')}`
            });
        }

        await updateSuccessActivityLog(activityLogId as number, true);
    }

    public async getSyncStatus(
        environmentId: number,
        providerConfigKey: string,
        syncNames: string[],
        connectionId?: string,
        includeJobStatus = false
    ): Promise<ReportedSyncJobStatus[] | void> {
        const syncsWithStatus: ReportedSyncJobStatus[] = [];

        if (connectionId) {
            const { success, error, response: connection } = await connectionService.getConnection(connectionId as string, providerConfigKey, environmentId);

            if (!success) {
                throw error;
            }

            for (const syncName of syncNames) {
                const sync = await getSyncByIdAndName(connection?.id as number, syncName);
                if (!sync) {
                    continue;
                }
                const latestJob = await getLatestSyncJob(sync?.id as string);
                const schedule = await getSchedule(sync?.id as string);
                const status: ReportedSyncJobStatus = {
                    id: sync?.id as string,
                    name: sync?.name as string,
                    status: this.classifySyncStatus(latestJob?.status as SyncStatus, schedule?.status as ScheduleStatus),
                    latestResult: latestJob?.result
                } as ReportedSyncJobStatus;
                if (includeJobStatus) {
                    status['jobStatus'] = latestJob?.status as SyncStatus;
                }
                syncsWithStatus.push(status);
            }
        } else {
            const syncs =
                syncNames.length > 0
                    ? await getSyncsByProviderConfigAndSyncNames(environmentId, providerConfigKey, syncNames)
                    : await getSyncsByProviderConfigKey(environmentId, providerConfigKey);

            if (!syncs) {
                return;
            }

            for (const sync of syncs) {
                const schedule = await getSchedule(sync?.id as string);
                const latestJob = await getLatestSyncJob(sync?.id as string);
                const status: ReportedSyncJobStatus = {
                    id: sync?.id,
                    name: sync?.name,
                    status: this.classifySyncStatus(latestJob?.status as SyncStatus, schedule?.status as ScheduleStatus),
                    latestResult: latestJob?.result
                } as ReportedSyncJobStatus;
                if (includeJobStatus) {
                    status['jobStatus'] = latestJob?.status as SyncStatus;
                }
                syncsWithStatus.push(status);
            }
        }

        return syncsWithStatus;
    }

    public classifySyncStatus(jobStatus: SyncStatus, scheduleStatus: ScheduleStatus): SyncStatus {
        if (scheduleStatus === ScheduleStatus.PAUSED && jobStatus !== SyncStatus.RUNNING) {
            return SyncStatus.PAUSED;
        } else if (scheduleStatus === ScheduleStatus.RUNNING && jobStatus === null) {
            return SyncStatus.ERROR;
        } else if (jobStatus === SyncStatus.STOPPED) {
            return SyncStatus.ERROR;
        } else if (jobStatus === SyncStatus.RUNNING) {
            return SyncStatus.RUNNING;
        } else if (jobStatus === SyncStatus.SUCCESS) {
            return SyncStatus.SUCCESS;
        }

        return SyncStatus.STOPPED;
    }

    /**
     * Trigger If Connections Exist
     * @desc for the recently deploy flows, create the sync and trigger it if there are connections
     */
    public async triggerIfConnectionsExist(flows: SyncDeploymentResult[], environmentId: number) {
        for (const flow of flows) {
            if (flow.type === SyncConfigType.ACTION) {
                continue;
            }

            const existingConnections = await connectionService.getConnectionsByEnvironmentAndConfig(environmentId, flow.providerConfigKey);

            if (existingConnections.length === 0) {
                continue;
            }

            const { providerConfigKey } = flow;
            const name = flow.name || flow.syncName;

            await this.create(
                existingConnections as Connection[],
                name as string,
                providerConfigKey,
                environmentId,
                flow as unknown as IncomingSyncConfig,
                false
            );
        }
    }
}

export default new Orchestrator();
