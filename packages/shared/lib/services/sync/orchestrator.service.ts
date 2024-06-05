import { deleteSyncConfig, deleteSyncFilesForConfig } from './config/config.service.js';
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
import { errorNotificationService } from '../notification/error.service.js';
import SyncClient from '../../clients/sync.client.js';
import configService from '../config.service.js';
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
import { LogActionEnum } from '../../models/Activity.js';
import environmentService from '../environment.service.js';
import type { Environment } from '../../models/Environment.js';

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

export class OrchestratorService {
    public async create(
        connections: Connection[],
        syncName: string,
        providerConfigKey: string,
        environmentId: number,
        sync: IncomingFlowConfig,
        logContextGetter: LogContextGetter,
        debug = false,
        logCtx?: LogContext
    ): Promise<boolean> {
        try {
            const syncConfig = await configService.getProviderConfig(providerConfigKey, environmentId);
            if (debug && logCtx) {
                await logCtx.debug(`Beginning iteration of starting syncs for ${syncName} with ${connections.length} connections`);
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
            if (debug && logCtx) {
                await logCtx.debug(`Finished iteration of starting syncs for ${syncName} with ${connections.length} connections`);
            }

            return true;
        } catch (err) {
            await logCtx?.error(`Error starting syncs for ${syncName} with ${connections.length} connections`, { error: err });

            return false;
        }
    }

    public async createSyncs(syncArgs: CreateSyncArgs[], logContextGetter: LogContextGetter, debug = false, logCtx?: LogContext): Promise<boolean> {
        let success = true;
        for (const syncToCreate of syncArgs) {
            const { connections, providerConfigKey, environmentId, sync, syncName } = syncToCreate;
            const result = await this.create(connections, syncName, providerConfigKey, environmentId, sync, logContextGetter, debug, logCtx);
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
        await errorNotificationService.sync.clearBySyncId({ sync_id: syncId });
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

    public async runSyncCommand({
        recordsService,
        environment,
        providerConfigKey,
        syncNames,
        command,
        logContextGetter,
        connectionId,
        initiator
    }: {
        recordsService: RecordsServiceInterface;
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

        const logCtx = await logContextGetter.create(
            { operation: { type: 'sync', action: syncCommandToOperation[command] }, message: '' },
            { account, environment, integration: { id: provider!.id!, name: provider!.unique_key, provider: provider!.provider } }
        );

        const syncClient = await SyncClient.getInstance();
        if (!syncClient) {
            return { success: false, error: new NangoError('failed_to_get_sync_client'), response: false };
        }

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

                await syncClient.runSyncCommand({
                    scheduleId: schedule.schedule_id,
                    syncId: sync?.id,
                    command,
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
                    await updateScheduleStatus(schedule.schedule_id, command, logCtx);
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

                await syncClient.runSyncCommand({
                    scheduleId: schedule.schedule_id,
                    syncId: sync.id,
                    command,
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
                    await updateScheduleStatus(schedule.schedule_id, command, logCtx);
                }
            }
        }

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
                const reportedStatus = this.reportedStatus(sync, latestJob, schedule, status, nextScheduledSyncAt, includeJobStatus);

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
                const reportedStatus = this.reportedStatus(sync, latestJob, schedule, status, nextScheduledSyncAt, includeJobStatus);

                syncsWithStatus.push(reportedStatus);
            }
        }

        return { success: true, error: null, response: syncsWithStatus };
    }

    /**
     * Classify Sync Status
     * @desc categorize the different scenarios of sync status
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
            if (syncSchedule?.schedule?.state?.paused && schedule?.status === ScheduleStatus.RUNNING) {
                await updateScheduleStatus(schedule?.id as string, SyncCommand.PAUSE);
                if (status !== SyncStatus.RUNNING) {
                    status = SyncStatus.PAUSED;
                }
                await telemetry.log(
                    LogTypes.TEMPORAL_SCHEDULE_MISMATCH_NOT_RUNNING,
                    'API: Schedule is marked as paused in temporal but not in the database. The schedule has been updated in the database to be paused.',
                    LogActionEnum.SYNC,
                    {
                        environmentId: String(environmentId),
                        syncId,
                        scheduleId: String(schedule?.schedule_id),
                        level: 'warn'
                    },
                    `syncId:${syncId}`
                );
            } else if (!syncSchedule?.schedule?.state?.paused && status === SyncStatus.PAUSED) {
                await updateScheduleStatus(schedule?.id as string, SyncCommand.UNPAUSE);
                status = SyncStatus.STOPPED;
                await telemetry.log(
                    LogTypes.TEMPORAL_SCHEDULE_MISMATCH_NOT_PAUSED,
                    'API: Schedule is marked as running in temporal but not in the database. The schedule has been updated in the database to be running.',
                    LogActionEnum.SYNC,
                    {
                        environmentId: String(environmentId),
                        syncId,
                        scheduleId: String(schedule?.schedule_id),
                        level: 'warn'
                    },
                    `syncId:${syncId}`
                );
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
            latestResult: latestJob?.result,
            latestExecutionStatus: latestJob?.status === SyncStatus.STOPPED ? SyncStatus.ERROR : latestJob?.status
        } as ReportedSyncJobStatus;

        if (includeJobStatus) {
            reportedStatus['jobStatus'] = latestJob?.status as SyncStatus;
        }

        return reportedStatus;
    }
}

export default new OrchestratorService();
