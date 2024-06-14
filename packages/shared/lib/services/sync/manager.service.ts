import { deleteSyncConfig, deleteSyncFilesForConfig, getSyncConfig } from './config/config.service.js';
import connectionService from '../connection.service.js';
import { deleteScheduleForSync, getSchedule, updateScheduleStatus } from './schedule.service.js';
import { getLatestSyncJob } from './job.service.js';
import telemetry, { LogTypes } from '../../utils/telemetry.js';
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
import { errorNotificationService } from '../notification/error.service.js';
import SyncClient from '../../clients/sync.client.js';
import configService from '../config.service.js';
import type { LogLevel } from '../../models/Activity.js';
import type { Connection, NangoConnection } from '../../models/Connection.js';
import type { SyncDeploymentResult, IncomingFlowConfig, Sync, SyncType, ReportedSyncJobStatus } from '../../models/Sync.js';
import { NangoError } from '../../utils/error.js';
import type { Config as ProviderConfig } from '../../models/Provider.js';
import type { ServiceResponse } from '../../models/Generic.js';
import { SyncStatus, ScheduleStatus, SyncConfigType, SyncCommand, CommandToActivityLog } from '../../models/Sync.js';
import type { LogContext, LogContextGetter } from '@nangohq/logs';
import type { RecordsServiceInterface } from '../../clients/sync.client.js';
import { LogActionEnum } from '../../models/Activity.js';
import { getLogger, stringifyError } from '@nangohq/utils';
import environmentService from '../environment.service.js';
import type { Environment } from '../../models/Environment.js';
import type { Orchestrator } from '../../clients/orchestrator.js';
import type { NangoConfig, NangoIntegration, NangoIntegrationData } from '../../models/NangoConfig.js';
import { featureFlags } from '../../index.js';

// Should be in "logs" package but impossible thanks to CLI
export const syncCommandToOperation = {
    PAUSE: 'pause',
    UNPAUSE: 'unpause',
    RUN: 'request_run',
    RUN_FULL: 'request_run_full',
    CANCEL: 'cancel'
} as const;

interface CreateSyncArgs {
    connections: Connection[];
    providerConfigKey: string;
    environmentId: number;
    sync: IncomingFlowConfig;
    syncName: string;
}

const logger = getLogger('sync.manager');

export class SyncManagerService {
    public async createSyncForConnection(nangoConnectionId: number, logContextGetter: LogContextGetter, orchestrator: Orchestrator): Promise<void> {
        const nangoConnection = (await connectionService.getConnectionById(nangoConnectionId)) as NangoConnection;
        const nangoConfig = await getSyncConfig(nangoConnection);
        if (!nangoConfig) {
            logger.error(
                'Failed to load the Nango config - will not start any syncs! If you expect to see a sync make sure you used the nango cli deploy command'
            );
            return;
        }
        const { integrations }: NangoConfig = nangoConfig;
        const providerConfigKey = nangoConnection?.provider_config_key;

        if (!integrations[providerConfigKey]) {
            return;
        }

        const syncClient = await SyncClient.getInstance();
        if (!syncClient) {
            return;
        }

        const providerConfig: ProviderConfig = (await configService.getProviderConfig(
            nangoConnection?.provider_config_key,
            nangoConnection?.environment_id
        )) as ProviderConfig;

        const syncObject = integrations[providerConfigKey] as unknown as Record<string, NangoIntegration>;
        const syncNames = Object.keys(syncObject);
        for (const syncName of syncNames) {
            const syncData = syncObject[syncName] as unknown as NangoIntegrationData;

            if (!syncData.enabled) {
                continue;
            }
            const sync = await createSync(nangoConnectionId, syncName);
            if (sync) {
                await orchestrator.scheduleSyncHelper(nangoConnection, sync, providerConfig, syncName, syncData, logContextGetter);
            }
        }
    }

    public async createSyncForConnections(
        connections: Connection[],
        syncName: string,
        providerConfigKey: string,
        environmentId: number,
        sync: IncomingFlowConfig,
        logContextGetter: LogContextGetter,
        orchestrator: Orchestrator,
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
                orchestrator.scheduleSyncHelper(
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
            const prettyError = stringifyError(e, { pretty: true });
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
        orchestrator: Orchestrator,
        debug = false,
        activityLogId?: number,
        logCtx?: LogContext
    ): Promise<boolean> {
        let success = true;
        for (const syncToCreate of syncArgs) {
            const { connections, providerConfigKey, environmentId, sync, syncName } = syncToCreate;
            const result = await this.createSyncForConnections(
                connections,
                syncName,
                providerConfigKey,
                environmentId,
                sync,
                logContextGetter,
                orchestrator,
                debug,
                activityLogId,
                logCtx
            );
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

    public async softDeleteSync(syncId: string, environmentId: number, orchestrator: Orchestrator) {
        await deleteScheduleForSync(syncId, environmentId); // TODO: legacy, to remove once temporal is removed

        await orchestrator.deleteSync({ syncId, environmentId });
        await softDeleteSync(syncId);
        await errorNotificationService.sync.clearBySyncId({ sync_id: syncId });
    }

    public async softDeleteSyncsByConnection(connection: Connection, orchestrator: Orchestrator) {
        const syncs = await getSyncsByConnectionId(connection.id!);

        if (!syncs) {
            return;
        }

        for (const sync of syncs) {
            await this.softDeleteSync(sync.id, connection.environment_id, orchestrator);
        }
    }

    public async deleteSyncsByProviderConfig(environmentId: number, providerConfigKey: string, orchestrator: Orchestrator) {
        const syncs = await getSyncsByProviderConfigKey(environmentId, providerConfigKey);

        if (!syncs) {
            return;
        }

        for (const sync of syncs) {
            await this.softDeleteSync(sync.id, environmentId, orchestrator);
        }
    }

    public async runSyncCommand({
        recordsService,
        orchestrator,
        environment,
        providerConfigKey,
        syncNames,
        command,
        logContextGetter,
        connectionId,
        initiator
    }: {
        recordsService: RecordsServiceInterface;
        orchestrator: Orchestrator;
        environment: Environment;
        providerConfigKey: string;
        syncNames: string[];
        command: SyncCommand;
        logContextGetter: LogContextGetter;
        connectionId?: string;
        initiator: string;
    }): Promise<ServiceResponse<boolean>> {
        const action = CommandToActivityLog[command];
        const provider = await configService.getProviderConfig(providerConfigKey, environment.id);
        const account = (await environmentService.getAccountFromEnvironment(environment.id))!;

        const log = {
            level: 'info' as LogLevel,
            success: false,
            action,
            start: Date.now(),
            end: Date.now(),
            timestamp: Date.now(),
            connection_id: connectionId || '',
            provider: provider!.provider,
            provider_config_key: providerConfigKey,
            environment_id: environment.id
        };
        const activityLogId = await createActivityLog(log);
        if (!activityLogId) {
            return { success: false, error: new NangoError('failed_to_create_activity_log'), response: false };
        }

        const logCtx = await logContextGetter.create(
            { id: String(activityLogId), operation: { type: 'sync', action: syncCommandToOperation[command] }, message: '' },
            { account, environment, integration: { id: provider!.id!, name: provider!.unique_key, provider: provider!.provider } }
        );

        if (connectionId) {
            const { success, error, response: connection } = await connectionService.getConnection(connectionId, providerConfigKey, environment.id);

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

                await orchestrator.runSyncCommandHelper({
                    scheduleId: schedule.schedule_id,
                    syncId: sync?.id,
                    command,
                    activityLogId,
                    environmentId: environment.id,
                    providerConfigKey,
                    connectionId,
                    syncName,
                    nangoConnectionId: connection.id,
                    logCtx,
                    recordsService,
                    initiator
                });
                // if they're triggering a sync that shouldn't change the schedule status
                if (command !== SyncCommand.RUN) {
                    await updateScheduleStatus(schedule.schedule_id, command, activityLogId, environment.id, logCtx);
                }
            }
        } else {
            const syncs =
                syncNames.length > 0
                    ? await getSyncsByProviderConfigAndSyncNames(environment.id, providerConfigKey, syncNames)
                    : await getSyncsByProviderConfigKey(environment.id, providerConfigKey);

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

                await orchestrator.runSyncCommandHelper({
                    scheduleId: schedule.schedule_id,
                    syncId: sync.id,
                    command,
                    activityLogId,
                    environmentId: environment.id,
                    providerConfigKey,
                    connectionId: connection.connection_id,
                    syncName: sync.name,
                    nangoConnectionId: connection.id,
                    logCtx,
                    recordsService,
                    initiator
                });
                if (command !== SyncCommand.RUN) {
                    await updateScheduleStatus(schedule.schedule_id, command, activityLogId, environment.id, logCtx);
                }
            }
        }

        await createActivityLogMessageAndEnd({
            level: 'info',
            environment_id: environment.id,
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
        orchestrator: Orchestrator,
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

                const reportedStatus = await this.syncStatus(sync, environmentId, includeJobStatus, orchestrator);

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
                const reportedStatus = await this.syncStatus(sync, environmentId, includeJobStatus, orchestrator);

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
    public legacyClassifySyncStatus(jobStatus: SyncStatus, scheduleStatus: ScheduleStatus): SyncStatus {
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

    public classifySyncStatus(jobStatus: SyncStatus, scheduleState: 'STARTED' | 'PAUSED' | 'DELETED'): SyncStatus {
        if (jobStatus === SyncStatus.RUNNING) {
            return SyncStatus.RUNNING;
        }
        switch (scheduleState) {
            case 'PAUSED':
                return SyncStatus.PAUSED;
            case 'STARTED':
                if (jobStatus === SyncStatus.STOPPED) {
                    // job status doesn't have a ERROR status
                    return SyncStatus.ERROR;
                }
                return jobStatus || SyncStatus.SUCCESS;
            default:
                return SyncStatus.STOPPED;
        }
    }

    /**
     * Trigger If Connections Exist
     * @desc for the recently deploy flows, create the sync and trigger it if there are connections
     */
    public async triggerIfConnectionsExist(
        flows: SyncDeploymentResult[],
        environmentId: number,
        logContextGetter: LogContextGetter,
        orchestrator: Orchestrator
    ) {
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

            await this.createSyncForConnections(
                existingConnections as Connection[],
                name as string,
                providerConfigKey,
                environmentId,
                flow as unknown as IncomingFlowConfig,
                logContextGetter,
                orchestrator,
                false
            );
        }
    }

    private async syncStatus(sync: Sync, environmentId: number, includeJobStatus: boolean, orchestrator: Orchestrator): Promise<ReportedSyncJobStatus> {
        const isGloballyEnabled = await featureFlags.isEnabled('orchestrator:schedule', 'global', false);
        const isEnvEnabled = await featureFlags.isEnabled('orchestrator:schedule', `${environmentId}`, false);
        const isOrchestrator = isGloballyEnabled || isEnvEnabled;
        if (isOrchestrator) {
            const latestJob = await getLatestSyncJob(sync.id);
            const schedules = await orchestrator.searchSchedules([{ syncId: sync.id, environmentId }]);
            if (schedules.isErr()) {
                throw new Error(`Failed to get schedule for sync ${sync.id} in environment ${environmentId}: ${stringifyError(schedules.error)}`);
            }
            const schedule = schedules.value.get(sync.id);
            if (!schedule) {
                throw new Error(`Schedule for sync ${sync.id} and environment ${environmentId} not found`);
            }
            return {
                id: sync.id,
                type: latestJob?.type as SyncType,
                finishedAt: latestJob?.updated_at,
                nextScheduledSyncAt: schedule.nextDueDate,
                name: sync.name,
                status: this.classifySyncStatus(latestJob?.status as SyncStatus, schedule.state),
                frequency: sync.frequency,
                latestResult: latestJob?.result,
                latestExecutionStatus: latestJob?.status,
                ...(includeJobStatus ? { jobStatus: latestJob?.status as SyncStatus } : {})
            } as ReportedSyncJobStatus;
        }
        return this.legacySyncStatus(sync, environmentId, includeJobStatus);
    }

    private async legacySyncStatus(sync: Sync, environmentId: number, includeJobStatus: boolean): Promise<ReportedSyncJobStatus> {
        const syncClient = await SyncClient.getInstance();
        const schedule = await getSchedule(sync.id);
        const latestJob = await getLatestSyncJob(sync.id);
        let status = this.legacyClassifySyncStatus(latestJob?.status as SyncStatus, schedule?.status as ScheduleStatus);
        const syncSchedule = await syncClient?.describeSchedule(schedule?.schedule_id as string);
        if (syncSchedule) {
            if (syncSchedule?.schedule?.state?.paused && schedule?.status === ScheduleStatus.RUNNING) {
                await updateScheduleStatus(schedule?.id as string, SyncCommand.PAUSE, null, environmentId);
                if (status !== SyncStatus.RUNNING) {
                    status = SyncStatus.PAUSED;
                }
                await telemetry.log(
                    LogTypes.TEMPORAL_SCHEDULE_MISMATCH_NOT_RUNNING,
                    'API: Schedule is marked as paused in temporal but not in the database. The schedule has been updated in the database to be paused.',
                    LogActionEnum.SYNC,
                    {
                        environmentId: String(environmentId),
                        syncId: sync.id,
                        scheduleId: String(schedule?.schedule_id),
                        level: 'warn'
                    },
                    `syncId:${sync.id}`
                );
            } else if (!syncSchedule?.schedule?.state?.paused && status === SyncStatus.PAUSED) {
                await updateScheduleStatus(schedule?.id as string, SyncCommand.UNPAUSE, null, environmentId);
                status = SyncStatus.STOPPED;
                await telemetry.log(
                    LogTypes.TEMPORAL_SCHEDULE_MISMATCH_NOT_PAUSED,
                    'API: Schedule is marked as running in temporal but not in the database. The schedule has been updated in the database to be running.',
                    LogActionEnum.SYNC,
                    {
                        environmentId: String(environmentId),
                        syncId: sync.id,
                        scheduleId: String(schedule?.schedule_id),
                        level: 'warn'
                    },
                    `syncId:${sync.id}`
                );
            }
        }

        let nextScheduledSyncAt = null;
        if (status !== SyncStatus.PAUSED) {
            if (syncSchedule && syncSchedule?.info && syncSchedule?.info.futureActionTimes && syncSchedule?.info?.futureActionTimes?.length > 0) {
                const futureRun = syncSchedule.info.futureActionTimes[0];
                nextScheduledSyncAt = syncClient?.formatFutureRun(futureRun?.seconds?.toNumber() as number) || null;
            }
        }

        const reportedStatus: ReportedSyncJobStatus = {
            id: sync?.id,
            type: latestJob?.type as SyncType,
            finishedAt: latestJob?.updated_at,
            nextScheduledSyncAt,
            name: sync?.name,
            status,
            frequency: schedule?.frequency,
            latestResult: latestJob?.result,
            latestExecutionStatus: latestJob?.status
        } as ReportedSyncJobStatus;

        if (includeJobStatus) {
            reportedStatus['jobStatus'] = latestJob?.status as SyncStatus;
        }

        return reportedStatus;
    }
}

export default new SyncManagerService();
