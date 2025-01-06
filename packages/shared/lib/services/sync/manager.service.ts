import { deleteSyncConfig, deleteSyncFilesForConfig, getSyncConfig, getSyncConfigByParams } from './config/config.service.js';
import connectionService from '../connection.service.js';
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
import { errorNotificationService } from '../notification/error.service.js';
import configService from '../config.service.js';
import type { Connection, NangoConnection } from '../../models/Connection.js';
import type { SyncWithConnectionId, ReportedSyncJobStatus, SyncCommand } from '../../models/Sync.js';
import { SyncType, SyncStatus } from '../../models/Sync.js';
import { NangoError } from '../../utils/error.js';
import type { Config as ProviderConfig } from '../../models/Provider.js';
import type { ServiceResponse } from '../../models/Generic.js';
import type { LogContext, LogContextGetter } from '@nangohq/logs';
import { getLogger, stringifyError } from '@nangohq/utils';
import environmentService from '../environment.service.js';
import type { Orchestrator, RecordsServiceInterface } from '../../clients/orchestrator.js';
import type { NangoConfig, NangoIntegration, NangoIntegrationData } from '../../models/NangoConfig.js';
import type { DBEnvironment, IncomingFlowConfig, SyncDeploymentResult } from '@nangohq/types';

// Should be in "logs" package but impossible thanks to CLI
export const syncCommandToOperation = {
    PAUSE: 'pause',
    UNPAUSE: 'unpause',
    RUN: 'request_run',
    RUN_FULL: 'request_run_full',
    CANCEL: 'cancel'
} as const;

export interface CreateSyncArgs {
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
        const nangoConfig = await getSyncConfig({ nangoConnection });
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
            const syncConfig = await getSyncConfigByParams(nangoConnection.environment_id, syncName, providerConfigKey);
            if (!syncConfig) {
                continue;
            }
            const sync = await createSync(nangoConnectionId, syncConfig);
            if (sync) {
                await orchestrator.scheduleSync({
                    nangoConnection,
                    sync,
                    providerConfig,
                    syncName,
                    syncData,
                    logContextGetter
                });
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
        logCtx?: LogContext
    ): Promise<boolean> {
        try {
            const providerConfig = await configService.getProviderConfig(providerConfigKey, environmentId);
            if (!providerConfig) {
                throw new Error(`Provider config not found for ${providerConfigKey} in environment ${environmentId}`);
            }
            if (debug) {
                await logCtx?.debug(`Beginning iteration of starting syncs for ${syncName} with ${connections.length} connections`);
            }
            for (const connection of connections) {
                const syncConfig = await getSyncConfigByParams(connection.environment_id, syncName, providerConfigKey);
                if (!syncConfig) {
                    continue;
                }
                const createdSync = await createSync(connection.id as number, syncConfig);
                if (!createdSync) {
                    continue;
                }
                await orchestrator.scheduleSync({
                    nangoConnection: connection,
                    sync: createdSync,
                    providerConfig: providerConfig,
                    syncName,
                    syncData: { ...sync, returns: sync.models, input: '' } as NangoIntegrationData,
                    logContextGetter,
                    debug
                });
            }
            if (debug) {
                await logCtx?.debug(`Finished iteration of starting syncs for ${syncName} with ${connections.length} connections`);
            }

            return true;
        } catch (err) {
            await logCtx?.error(`Error starting syncs for ${syncName} with ${connections.length} connections`, { error: err });

            return false;
        }
    }

    public async createSyncs(
        syncArgs: CreateSyncArgs[],
        logContextGetter: LogContextGetter,
        orchestrator: Orchestrator,
        debug = false,
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
        environment: DBEnvironment;
        providerConfigKey: string;
        syncNames: string[];
        command: SyncCommand;
        logContextGetter: LogContextGetter;
        connectionId?: string;
        initiator: string;
    }): Promise<ServiceResponse<boolean>> {
        const provider = await configService.getProviderConfig(providerConfigKey, environment.id);
        const account = (await environmentService.getAccountFromEnvironment(environment.id))!;

        const logCtx = await logContextGetter.create(
            { operation: { type: 'sync', action: syncCommandToOperation[command] } },
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

                await orchestrator.runSyncCommand({
                    connectionId: connection.id!,
                    syncId: sync.id,
                    command,
                    environmentId: environment.id,
                    logCtx,
                    recordsService,
                    initiator
                });
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
                const connection = await connectionService.getConnectionById(sync.nango_connection_id);
                if (!connection) {
                    continue;
                }

                await orchestrator.runSyncCommand({
                    connectionId: connection.id!,
                    syncId: sync.id,
                    command,
                    environmentId: environment.id,
                    logCtx,
                    recordsService,
                    initiator
                });
            }
        }

        await logCtx.info('Sync was successfully updated', { command, syncNames });
        await logCtx.success();

        return { success: true, error: null, response: true };
    }

    public async getSyncStatus(
        environmentId: number,
        providerConfigKey: string,
        syncNames: string[],
        orchestrator: Orchestrator,
        recordsService: RecordsServiceInterface,
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

                const syncWithConnectionId: SyncWithConnectionId = {
                    ...sync,
                    connection_id: connection.connection_id
                };

                const reportedStatus = await this.syncStatus({
                    sync: syncWithConnectionId,
                    environmentId,
                    providerConfigKey,
                    includeJobStatus,
                    orchestrator,
                    recordsService
                });

                syncsWithStatus.push(reportedStatus);
            }
        } else {
            const syncs: SyncWithConnectionId[] =
                syncNames.length > 0
                    ? await getSyncsByProviderConfigAndSyncNames(environmentId, providerConfigKey, syncNames)
                    : await getSyncsByProviderConfigKey(environmentId, providerConfigKey);

            if (!syncs) {
                return { success: true, error: null, response: syncsWithStatus };
            }

            for (const sync of syncs) {
                const reportedStatus = await this.syncStatus({ sync, environmentId, providerConfigKey, includeJobStatus, orchestrator, recordsService });

                syncsWithStatus.push(reportedStatus);
            }
        }

        return { success: true, error: null, response: syncsWithStatus };
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
            if (flow.type === 'action') {
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

    private async syncStatus({
        sync,
        environmentId,
        providerConfigKey,
        includeJobStatus,
        orchestrator,
        recordsService
    }: {
        sync: SyncWithConnectionId;
        environmentId: number;
        providerConfigKey: string;
        includeJobStatus: boolean;
        orchestrator: Orchestrator;
        recordsService: RecordsServiceInterface;
    }): Promise<ReportedSyncJobStatus> {
        const latestJob = await getLatestSyncJob(sync.id);
        const schedules = await orchestrator.searchSchedules([{ syncId: sync.id, environmentId }]);
        if (schedules.isErr()) {
            throw new Error(`Failed to get schedule for sync ${sync.id} in environment ${environmentId}: ${stringifyError(schedules.error)}`);
        }
        const schedule = schedules.value.get(sync.id);
        let frequency = sync.frequency;
        const syncConfig = await getSyncConfigByParams(environmentId, sync.name, providerConfigKey);
        if (!frequency) {
            frequency = syncConfig?.runs || null;
        }
        if (!schedule) {
            throw new Error(`Schedule for sync ${sync.id} and environment ${environmentId} not found`);
        }

        const countRes = await recordsService.getRecordCountsByModel({ connectionId: sync.nango_connection_id, environmentId });
        if (countRes.isErr()) {
            throw new Error(`Failed to get records count for sync ${sync.id} in environment ${environmentId}: ${stringifyError(countRes.error)}`);
        }
        const recordCount: Record<string, number> =
            syncConfig?.models.reduce(
                (acc, model) => {
                    acc[model] = countRes.isOk() ? countRes.value[model]?.count || 0 : 0;
                    return acc;
                },
                {} as Record<string, number>
            ) || {};

        return {
            id: sync.id,
            connection_id: sync.connection_id,
            type: latestJob?.type === SyncType.INCREMENTAL ? latestJob.type : 'INITIAL',
            finishedAt: latestJob?.updated_at,
            nextScheduledSyncAt: schedule.nextDueDate,
            name: sync.name,
            status: this.classifySyncStatus(latestJob?.status as SyncStatus, schedule.state),
            frequency,
            latestResult: latestJob?.result,
            latestExecutionStatus: latestJob?.status,
            recordCount,
            ...(includeJobStatus ? { jobStatus: latestJob?.status as SyncStatus } : {})
        };
    }
}

export default new SyncManagerService();
