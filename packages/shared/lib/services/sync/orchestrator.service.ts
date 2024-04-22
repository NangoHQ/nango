import { deleteSyncConfig, deleteSyncFilesForConfig } from './config/config.service.js';
import connectionService from '../connection.service.js';
import { deleteScheduleForSync, getSchedule, updateScheduleStatus } from './schedule.service.js';
import { getLatestSyncJob } from './job.service.js';
import {
    createSync,
    getSyncsByConnectionId,
    getSyncsByProviderConfigKey,
    getSyncsByProviderConfigAndSyncNames,
    getSyncByIdAndName,
    getSyncNamesByConnectionId,
    softDeleteSync
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
import type {
    Job as SyncJob,
    Schedule as SyncSchedule,
    SyncDeploymentResult,
    IncomingFlowConfig,
    Sync,
    SyncType,
    ReportedSyncJobStatus
} from '../../models/Sync.js';
import { NangoError } from '../../utils/error.js';
import type { Config as ProviderConfig } from '../../models/Provider.js';
import type { ServiceResponse } from '../../models/Generic.js';
import { SyncStatus, ScheduleStatus, SyncConfigType, SyncCommand, CommandToActivityLog } from '../../models/Sync.js';
import type { LogContext, LogContextGetter } from '@nangohq/logs';
import type { RecordsServiceInterface } from '../../clients/sync.client.js';

// Should be in "logs" package but impossible thanks to CLI
export const syncCommandToOperation = {
    PAUSE: 'pause',
    UNPAUSE: 'unpause',
    RUN: 'run',
    RUN_FULL: 'run_full',
    CANCEL: 'cancel'
} as const;

interface CreateSyncArgs {
    connections: Connection[];
    providerConfigKey: string;
    environmentId: number;
    sync: IncomingFlowConfig;
    syncName: string;
}

export class Orchestrator {
    public async create(
        connections: Connection[],
        syncName: string,
        providerConfigKey: string,
        environmentId: number,
        sync: IncomingFlowConfig,
        logContextGetter: LogContextGetter,
        debug = false,
        activityLogId?: number,
        logCtx?: LogContext
    ): Promise<boolean> {
        try {
            const syncConfig = await configService.getProviderConfig(providerConfigKey, environmentId);
            if (debug && activityLogId) {
                await createActivityLogMessage({
                    level: 'debug',
                    environment_id: environmentId,
                    activity_log_id: activityLogId,
                    timestamp: Date.now(),
                    content: `Beginning iteration of starting syncs for ${syncName} with ${connections.length} connections`
                });
                await logCtx?.debug(`Beginning iteration of starting syncs for ${syncName} with ${connections.length} connections`);
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
                    { ...sync, returns: sync.models, input: '' },
                    logContextGetter,
                    debug
                );
            }
            if (debug && activityLogId) {
                await createActivityLogMessage({
                    level: 'debug',
                    environment_id: environmentId,
                    activity_log_id: activityLogId,
                    timestamp: Date.now(),
                    content: `Finished iteration of starting syncs for ${syncName} with ${connections.length} connections`
                });
                await logCtx?.debug(`Finished iteration of starting syncs for ${syncName} with ${connections.length} connections`);
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
            await logCtx?.error(`Error starting syncs for ${syncName} with ${connections.length} connections`, { error: e });

            return false;
        }
    }

    public async createSyncs(
        syncArgs: CreateSyncArgs[],
        logContextGetter: LogContextGetter,
        debug = false,
        activityLogId?: number,
        logCtx?: LogContext
    ): Promise<boolean> {
        let success = true;
        for (const syncToCreate of syncArgs) {
            const { connections, providerConfigKey, environmentId, sync, syncName } = syncToCreate;
            const result = await this.create(connections, syncName, providerConfigKey, environmentId, sync, logContextGetter, debug, activityLogId, logCtx);
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

    public async softDeleteSync(syncId: string, environmentId: number) {
        await deleteScheduleForSync(syncId, environmentId);
        await softDeleteSync(syncId);
    }

    public async softDeleteSyncsByConnection(connection: Connection) {
        const syncs = await getSyncsByConnectionId(connection.id!);

        if (!syncs) {
            return;
        }

        for (const sync of syncs) {
            await this.softDeleteSync(sync.id, connection.environment_id);
        }
    }

    public async deleteSyncsByProviderConfig(environmentId: number, providerConfigKey: string) {
        const syncs = await getSyncsByProviderConfigKey(environmentId, providerConfigKey);

        if (!syncs) {
            return;
        }

        for (const sync of syncs) {
            await this.softDeleteSync(sync.id, environmentId);
        }
    }

    public async runSyncCommand(
        recordsService: RecordsServiceInterface,
        environmentId: number,
        providerConfigKey: string,
        syncNames: string[],
        command: SyncCommand,
        logContextGetter: LogContextGetter,
        connectionId?: string
    ): Promise<ServiceResponse<boolean>> {
        const action = CommandToActivityLog[command];
        const provider = await configService.getProviderName(providerConfigKey);

        const log = {
            level: 'info' as LogLevel,
            success: false,
            action,
            start: Date.now(),
            end: Date.now(),
            timestamp: Date.now(),
            connection_id: connectionId || '',
            provider,
            provider_config_key: providerConfigKey,
            environment_id: environmentId
        };
        const activityLogId = await createActivityLog(log);
        if (!activityLogId) {
            return { success: false, error: new NangoError('failed_to_create_activity_log'), response: false };
        }

        const logCtx = await logContextGetter.create(
            { id: String(activityLogId), operation: { type: 'sync', action: syncCommandToOperation[command] }, message: '' },
            { account: { id: -1 }, environment: { id: environmentId } }
        );

        const syncClient = await SyncClient.getInstance();
        if (!syncClient) {
            return { success: false, error: new NangoError('failed_to_get_sync_client'), response: false };
        }

        if (connectionId) {
            const { success, error, response: connection } = await connectionService.getConnection(connectionId, providerConfigKey, environmentId);

            if (!success || !connection) {
                return { success: false, error, response: false };
            }

            let syncs = syncNames;

            if (syncs.length === 0) {
                syncs = await getSyncNamesByConnectionId(connection.id as number);
            }

            for (const syncName of syncs) {
                const sync = await getSyncByIdAndName(connection.id as number, syncName);
                if (!sync) {
                    throw new Error(`Sync "${syncName}" doesn't exists.`);
                }
                const schedule = await getSchedule(sync.id);
                if (!schedule) {
                    continue;
                }

                await syncClient.runSyncCommand({
                    scheduleId: schedule.schedule_id,
                    syncId: sync?.id,
                    command,
                    activityLogId,
                    environmentId,
                    providerConfigKey,
                    connectionId,
                    syncName,
                    nangoConnectionId: connection.id,
                    logCtx,
                    recordsService
                });
                // if they're triggering a sync that shouldn't change the schedule status
                if (command !== SyncCommand.RUN) {
                    await updateScheduleStatus(schedule.schedule_id, command, activityLogId, environmentId, logCtx);
                }
            }
        } else {
            const syncs =
                syncNames.length > 0
                    ? await getSyncsByProviderConfigAndSyncNames(environmentId, providerConfigKey, syncNames)
                    : await getSyncsByProviderConfigKey(environmentId, providerConfigKey);

            if (!syncs) {
                const error = new NangoError('no_syncs_found');

                return { success: false, error, response: false };
            }

            for (const sync of syncs) {
                const schedule = await getSchedule(sync.id);
                if (!schedule) {
                    continue;
                }

                const connection = await connectionService.getConnectionById(sync.nango_connection_id);
                if (!connection) {
                    continue;
                }

                await syncClient.runSyncCommand({
                    scheduleId: schedule.schedule_id,
                    syncId: sync.id,
                    command,
                    activityLogId,
                    environmentId,
                    providerConfigKey,
                    connectionId: connection.connection_id,
                    syncName: sync.name,
                    nangoConnectionId: connection.id,
                    logCtx,
                    recordsService
                });
                if (command !== SyncCommand.RUN) {
                    await updateScheduleStatus(schedule.schedule_id, command, activityLogId, environmentId, logCtx);
                }
            }
        }

        await createActivityLogMessageAndEnd({
            level: 'info',
            environment_id: environmentId,
            activity_log_id: activityLogId,
            timestamp: Date.now(),
            content: `Sync was updated with command: "${action}" for sync: ${syncNames.join(', ')}`
        });

        await updateSuccessActivityLog(activityLogId, true);

        await logCtx.info('Sync was successfully updated', { action, syncNames });
        await logCtx.success();

        return { success: true, error: null, response: true };
    }

    public async getSyncStatus(
        environmentId: number,
        providerConfigKey: string,
        syncNames: string[],
        connectionId?: string,
        includeJobStatus = false,
        optionalConnection?: Connection | null
    ): Promise<ServiceResponse<ReportedSyncJobStatus[] | void>> {
        const syncsWithStatus: ReportedSyncJobStatus[] = [];

        let connection = optionalConnection;
        if (connectionId && !connection) {
            const connectionResult = await connectionService.getConnection(connectionId, providerConfigKey, environmentId);
            if (!connectionResult.success || !connectionResult.response) {
                return { success: false, error: connectionResult.error, response: null };
            }
            connection = connectionResult.response;
        }

        if (connection) {
            for (const syncName of syncNames) {
                const sync = await getSyncByIdAndName(connection?.id as number, syncName);
                if (!sync) {
                    continue;
                }

                const { schedule, latestJob, status, nextScheduledSyncAt } = await this.fetchSyncData(sync?.id, environmentId);
                const reportedStatus = await this.reportedStatus(sync, latestJob, schedule, status, nextScheduledSyncAt, includeJobStatus);

                syncsWithStatus.push(reportedStatus);
            }
        } else {
            const syncs =
                syncNames.length > 0
                    ? await getSyncsByProviderConfigAndSyncNames(environmentId, providerConfigKey, syncNames)
                    : await getSyncsByProviderConfigKey(environmentId, providerConfigKey);

            if (!syncs) {
                return { success: true, error: null, response: syncsWithStatus };
            }

            for (const sync of syncs) {
                const { schedule, latestJob, status, nextScheduledSyncAt } = await this.fetchSyncData(sync?.id, environmentId);
                const reportedStatus = await this.reportedStatus(sync, latestJob, schedule, status, nextScheduledSyncAt, includeJobStatus);

                syncsWithStatus.push(reportedStatus);
            }
        }

        return { success: true, error: null, response: syncsWithStatus };
    }

    /**
     * Classify Sync Status
     * @desc categornize the different scenarios of sync status
     * 1. If the schedule is paused and the job is not running, then the sync is paused
     * 2. If the schedule is paused and the job is not running then the sync is stopped (last return case)
     * 3. If the schedule is running but the last job is null then it is an error
     * 4. If the job status is stopped then it is an error
     * 5. If the job status is running then it is running
     * 6. If the job status is success then it is success
     */
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
    public async triggerIfConnectionsExist(flows: SyncDeploymentResult[], environmentId: number, logContextGetter: LogContextGetter) {
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
                flow as unknown as IncomingFlowConfig,
                logContextGetter,
                false
            );
        }
    }
    private async fetchSyncData(syncId: string, environmentId: number) {
        const syncClient = await SyncClient.getInstance();
        const schedule = await getSchedule(syncId);
        const latestJob = await getLatestSyncJob(syncId);
        let status = this.classifySyncStatus(latestJob?.status as SyncStatus, schedule?.status as ScheduleStatus);

        const syncSchedule = await syncClient?.describeSchedule(schedule?.schedule_id as string);
        if (syncSchedule) {
            if (syncSchedule?.schedule?.state?.paused && status !== SyncStatus.PAUSED) {
                await updateScheduleStatus(schedule?.id as string, SyncCommand.PAUSE, null, environmentId);
                if (status !== SyncStatus.RUNNING) {
                    status = SyncStatus.PAUSED;
                }
            } else if (!syncSchedule?.schedule?.state?.paused && status === SyncStatus.PAUSED) {
                await updateScheduleStatus(schedule?.id as string, SyncCommand.UNPAUSE, null, environmentId);
                status = SyncStatus.STOPPED;
            }
        }

        let nextScheduledSyncAt = null;
        if (status !== SyncStatus.PAUSED) {
            if (syncSchedule && syncSchedule?.info && syncSchedule?.info.futureActionTimes && syncSchedule?.info?.futureActionTimes?.length > 0) {
                const futureRun = syncSchedule.info.futureActionTimes[0];
                nextScheduledSyncAt = syncClient?.formatFutureRun(futureRun?.seconds?.toNumber() as number);
            }
        }

        return { schedule, latestJob, status, nextScheduledSyncAt };
    }

    private reportedStatus(
        sync: Sync,
        latestJob: SyncJob | null,
        schedule: SyncSchedule | null,
        status: SyncStatus,
        nextScheduledSyncAt?: string | Date | null,
        includeJobStatus = false
    ) {
        const reportedStatus: ReportedSyncJobStatus = {
            id: sync?.id,
            type: latestJob?.type as SyncType,
            finishedAt: latestJob?.updated_at,
            nextScheduledSyncAt,
            name: sync?.name,
            status,
            frequency: schedule?.frequency,
            latestResult: latestJob?.result
        } as ReportedSyncJobStatus;

        if (includeJobStatus) {
            reportedStatus['jobStatus'] = latestJob?.status as SyncStatus;
        }

        return reportedStatus;
    }
}

export default new Orchestrator();
