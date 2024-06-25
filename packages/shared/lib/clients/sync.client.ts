import type { ScheduleDescription } from '@temporalio/client';
import { Client, Connection, ScheduleOverlapPolicy } from '@temporalio/client';
import type { NangoConnection } from '../models/Connection.js';
import type { StringValue } from 'ms';
import ms from 'ms';
import fs from 'fs-extra';
import type { Config as ProviderConfig } from '../models/Provider.js';
import type { NangoIntegrationData } from '../models/NangoConfig.js';
import type { Sync, SyncWithSchedule } from '../models/Sync.js';
import { SyncStatus, SyncType, ScheduleStatus, SyncCommand } from '../models/Sync.js';
import type { LogLevel } from '../models/Activity.js';
import { LogActionEnum } from '../models/Activity.js';
import { SYNC_TASK_QUEUE } from '../constants.js';
import { createActivityLog } from '../services/activity/activity.service.js';
import { isSyncJobRunning, createSyncJob, updateRunId } from '../services/sync/job.service.js';
import { getInterval } from '@nangohq/nango-yaml';
import { getSyncConfigRaw } from '../services/sync/config/config.service.js';
import { updateOffset, createSchedule as createSyncSchedule, getScheduleById } from '../services/sync/schedule.service.js';
import { clearLastSyncDate } from '../services/sync/sync.service.js';
import errorManager, { ErrorSourceEnum } from '../utils/error.manager.js';
import { NangoError } from '../utils/error.js';
import type { LogContext, LogContextGetter } from '@nangohq/logs';
import { isTest, isProd, Ok, Err } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';
import type { InitialSyncArgs } from '../models/worker.js';
import environmentService from '../services/environment.service.js';

const generateWorkflowId = (sync: Pick<Sync, 'id'>, syncName: string, connectionId: string) => `${SYNC_TASK_QUEUE}.${syncName}.${connectionId}-${sync.id}`;
const generateScheduleId = (sync: Pick<Sync, 'id'>, syncName: string, connectionId: string) =>
    `${SYNC_TASK_QUEUE}.${syncName}.${connectionId}-schedule-${sync.id}`;

const OVERLAP_POLICY: ScheduleOverlapPolicy = ScheduleOverlapPolicy.BUFFER_ONE;

const namespace = process.env['TEMPORAL_NAMESPACE'] || 'default';

export interface RecordsServiceInterface {
    deleteRecordsBySyncId({ syncId }: { syncId: string }): Promise<{ totalDeletedRecords: number }>;
}

class SyncClient {
    private static instance: Promise<SyncClient | null>;
    private client: Client | null = null;
    private namespace = namespace;

    private constructor(client: Client) {
        this.client = client;
    }

    static getInstance(): Promise<SyncClient | null> {
        if (!this.instance) {
            this.instance = this.create();
        }
        return this.instance;
    }

    private static async create(): Promise<SyncClient | null> {
        if (isTest) {
            return new SyncClient(true as any);
        }

        const temporalAddress = process.env['TEMPORAL_ADDRESS'];
        if (!temporalAddress) {
            throw new Error('TEMPORAL_ADDRESS missing from env var');
        }

        try {
            const connection = await Connection.connect({
                address: temporalAddress,
                tls: isProd
                    ? {
                          clientCertPair: {
                              crt: await fs.readFile(`/etc/secrets/${namespace}.crt`),
                              key: await fs.readFile(`/etc/secrets/${namespace}.key`)
                          }
                      }
                    : false
            });
            const client = new Client({
                connection,
                namespace
            });
            return new SyncClient(client);
        } catch (e) {
            errorManager.report(e, {
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.SYNC_CLIENT,
                metadata: {
                    namespace,
                    address: temporalAddress
                }
            });
            return null;
        }
    }

    getClient = (): Client | null => this.client;

    /**
     * Start Continuous
     * @desc get the connection information and the provider information
     * and kick off an initial sync and also a incremental sync. Also look
     * up any sync configs to call any integration snippet that was setup
     */
    async startContinuous(
        nangoConnection: NangoConnection,
        sync: Sync,
        providerConfig: ProviderConfig,
        syncName: string,
        syncData: NangoIntegrationData,
        logContextGetter: LogContextGetter,
        shouldLog: boolean,
        debug = false
    ): Promise<void> {
        let logCtx: LogContext | undefined;

        try {
            const activityLogId = await createActivityLog({
                level: 'info' as LogLevel,
                success: null,
                action: LogActionEnum.SYNC_INIT,
                start: Date.now(),
                end: Date.now(),
                timestamp: Date.now(),
                connection_id: nangoConnection.connection_id,
                provider_config_key: nangoConnection.provider_config_key,
                provider: providerConfig.provider,
                session_id: sync?.id?.toString(),
                environment_id: nangoConnection.environment_id,
                operation_name: syncName
            });
            if (!activityLogId) {
                return;
            }

            const syncConfig = await getSyncConfigRaw({
                environmentId: nangoConnection.environment_id,
                config_id: providerConfig.id!,
                name: syncName,
                isAction: false
            });

            const { account, environment } = (await environmentService.getAccountAndEnvironment({ environmentId: nangoConnection.environment_id }))!;

            logCtx = await logContextGetter.create(
                { id: String(activityLogId), operation: { type: 'sync', action: 'init' }, message: 'Sync initialization' },
                {
                    account,
                    environment,
                    integration: { id: providerConfig.id!, name: providerConfig.unique_key, provider: providerConfig.provider },
                    connection: { id: nangoConnection.id!, name: nangoConnection.connection_id },
                    syncConfig: { id: syncConfig!.id!, name: syncConfig!.sync_name }
                },
                { dryRun: shouldLog }
            );

            const intervalParsing = getInterval(syncData.runs, new Date());
            if (intervalParsing instanceof Error) {
                const content = `The sync was not created or started due to an error with the sync interval "${syncData.runs}": ${intervalParsing.message}`;
                await logCtx.error('The sync was not created or started due to an error with the sync interval', {
                    error: intervalParsing,
                    runs: syncData.runs
                });
                await logCtx.failed();

                errorManager.report(content, {
                    source: ErrorSourceEnum.CUSTOMER,
                    operation: LogActionEnum.SYNC_CLIENT,
                    environmentId: nangoConnection.environment_id,
                    metadata: {
                        connectionDetails: nangoConnection,
                        providerConfig,
                        syncName,
                        sync,
                        syncData
                    }
                });

                return;
            }

            const jobId = generateWorkflowId(sync, syncName, nangoConnection.connection_id);

            if (syncData.auto_start !== false) {
                if (debug) {
                    await logCtx.debug('Creating sync job', { jobId, syncId: sync.id });
                }

                const res = await this.triggerInitialSync({ jobId, nangoConnection, syncId: sync.id, syncName, debug });
                if (!res) {
                    throw new NangoError('failed_to_start_initial_sync');
                }
            } else {
                await createSyncJob(sync.id, SyncType.INITIAL, SyncStatus.PAUSED, jobId, nangoConnection);
            }

            const { interval, offset } = intervalParsing;
            const scheduleId = generateScheduleId(sync, syncName, nangoConnection.connection_id);

            const scheduleHandle = await this.client?.schedule.create({
                scheduleId,
                policies: {
                    overlap: OVERLAP_POLICY
                },
                spec: {
                    /**
                     * @see https://nodejs.temporal.io/api/interfaces/client.IntervalSpec
                     */
                    intervals: [
                        {
                            every: interval,
                            offset
                        }
                    ]
                },
                action: {
                    type: 'startWorkflow',
                    workflowType: 'continuousSync',
                    taskQueue: SYNC_TASK_QUEUE,
                    args: [
                        {
                            syncId: sync.id,
                            nangoConnection,
                            syncName,
                            debug
                        }
                    ]
                }
            });

            if (syncData.auto_start === false && scheduleHandle) {
                await scheduleHandle.pause(`schedule for sync '${sync.id}' paused at ${new Date().toISOString()}. Reason: auto_start is false`);
            }

            await createSyncSchedule(sync.id, interval, offset, syncData.auto_start === false ? ScheduleStatus.PAUSED : ScheduleStatus.RUNNING, scheduleId);

            if (scheduleHandle) {
                await logCtx.info('Scheduled successfully', { runs: syncData.runs });
            }

            await logCtx.success();
        } catch (err) {
            errorManager.report(err, {
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.SYNC_CLIENT,
                environmentId: nangoConnection.environment_id,
                metadata: {
                    syncName,
                    connectionDetails: JSON.stringify(nangoConnection),
                    syncId: sync.id,
                    providerConfig,
                    syncData: JSON.stringify(syncData)
                }
            });
            if (logCtx) {
                await logCtx.error('Failed to init sync', { error: err });
                await logCtx.failed();
            }
        }
    }

    async deleteSyncSchedule(id: string, environmentId: number): Promise<boolean> {
        if (!this.client) {
            return false;
        }

        const workflowService = this.client?.workflowService;
        try {
            await workflowService?.deleteSchedule({
                scheduleId: id,
                namespace: this.namespace
            });
            return true;
        } catch (e) {
            errorManager.report(e, {
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.SYNC,
                environmentId,
                metadata: {
                    id
                }
            });
            return false;
        }
    }

    async describeSchedule(schedule_id: string) {
        if (!this.client) {
            return;
        }

        const workflowService = this.client?.workflowService;

        try {
            const schedule = await workflowService?.describeSchedule({
                scheduleId: schedule_id,
                namespace: this.namespace
            });

            return schedule;
        } catch {
            return false;
        }
    }

    formatFutureRun(nextRun: number): Date | string {
        if (!nextRun) {
            return '-';
        }

        const milliseconds = Number(nextRun) * 1000;

        const date = new Date(milliseconds);

        return date;
    }

    async runSyncCommand({
        scheduleId,
        syncId,
        command,
        environmentId,
        providerConfigKey,
        connectionId,
        syncName,
        nangoConnectionId,
        logCtx,
        recordsService,
        initiator
    }: {
        scheduleId: string;
        syncId: string;
        command: SyncCommand;
        environmentId: number;
        providerConfigKey: string;
        connectionId: string;
        syncName: string;
        nangoConnectionId?: number | undefined;
        logCtx: LogContext;
        recordsService: RecordsServiceInterface;
        initiator: string;
    }): Promise<Result<boolean>> {
        const scheduleHandle = this.client?.schedule.getHandle(scheduleId);

        try {
            switch (command) {
                case SyncCommand.CANCEL:
                    {
                        const result = await this.cancelSync(syncId);

                        if (result.isErr()) {
                            return result;
                        }
                    }
                    break;
                case SyncCommand.PAUSE:
                    {
                        await scheduleHandle?.pause(`${initiator} paused the schedule for sync '${syncId}' at ${new Date().toISOString()}`);
                    }
                    break;
                case SyncCommand.UNPAUSE:
                    {
                        await scheduleHandle?.unpause(`${initiator} unpaused the schedule for sync '${syncId}' at ${new Date().toISOString()}`);
                        await scheduleHandle?.trigger(OVERLAP_POLICY);
                        const schedule = await getScheduleById(scheduleId);
                        if (schedule) {
                            const { frequency } = schedule;
                            const interval = getInterval(frequency, new Date());
                            if (!(interval instanceof Error)) {
                                const { offset } = interval;
                                await this.updateSyncSchedule(scheduleId, frequency, offset, environmentId);
                                await updateOffset(scheduleId, offset);
                            }
                        }
                    }
                    break;
                case SyncCommand.RUN:
                    await scheduleHandle?.trigger(OVERLAP_POLICY);
                    break;
                case SyncCommand.RUN_FULL:
                    {
                        // we just want to try and cancel if the sync is running
                        // so we don't care about the result
                        await this.cancelSync(syncId);

                        await clearLastSyncDate(syncId);
                        const del = await recordsService.deleteRecordsBySyncId({ syncId });
                        await logCtx.info(`Records for the sync were deleted successfully`, del);
                        const nangoConnection: NangoConnection = {
                            id: nangoConnectionId as number,
                            provider_config_key: providerConfigKey,
                            connection_id: connectionId,
                            environment_id: environmentId
                        };

                        await this.triggerInitialSync({ syncId, nangoConnection, syncName });
                    }
                    break;
            }

            return Ok(true);
        } catch (err) {
            await logCtx.error(`Sync command failed "${command}"`, { error: err, command });

            return Err(err as Error);
        }
    }

    async cancelSync(syncId: string): Promise<Result<boolean>> {
        const jobIsRunning = await isSyncJobRunning(syncId);
        if (jobIsRunning) {
            const { job_id, run_id } = jobIsRunning;
            if (!run_id) {
                const error = new NangoError('run_id_not_found');
                return Err(error);
            }

            const workflowHandle = this.client?.workflow.getHandle(job_id, run_id);
            if (!workflowHandle) {
                const error = new NangoError('run_id_not_found');
                return Err(error);
            }

            try {
                await workflowHandle.cancel();
                // We await the results otherwise it might not be cancelled yet
                await workflowHandle.result();
            } catch (err) {
                return Err(new NangoError('failed_to_cancel_sync', err as any));
            }
        } else {
            const error = new NangoError('sync_job_not_running');
            return Err(error);
        }

        return Ok(true);
    }

    async triggerSyncs(syncs: SyncWithSchedule[], environmentId: number) {
        for (const sync of syncs) {
            try {
                const scheduleHandle = this.client?.schedule.getHandle(sync.schedule_id);
                await scheduleHandle?.trigger(OVERLAP_POLICY);
            } catch (e) {
                errorManager.report(e, {
                    source: ErrorSourceEnum.PLATFORM,
                    operation: LogActionEnum.SYNC_CLIENT,
                    environmentId,
                    metadata: {
                        syncs
                    }
                });
            }
        }
    }

    async updateSyncSchedule(schedule_id: string, interval: string, offset: number, environmentId: number, syncName?: string, logCtx?: LogContext) {
        function updateFunction(scheduleDescription: ScheduleDescription) {
            scheduleDescription.spec = {
                intervals: [
                    {
                        every: ms(interval as StringValue),
                        offset
                    }
                ]
            };
            return scheduleDescription;
        }

        try {
            const scheduleHandle = this.client?.schedule.getHandle(schedule_id);

            await scheduleHandle?.update(updateFunction);

            if (logCtx && syncName) {
                await logCtx?.info(`Updated sync "${syncName}" schedule "${schedule_id}" with interval ${interval} and offset ${offset}`);
            }
        } catch (e) {
            errorManager.report(e, {
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.SYNC_CLIENT,
                environmentId,
                metadata: {
                    syncName,
                    schedule_id,
                    interval,
                    offset
                }
            });
        }
    }

    async triggerInitialSync({
        syncId,
        jobId,
        syncName,
        nangoConnection,
        debug
    }: {
        syncId: string;
        jobId?: string;
        syncName: string;
        nangoConnection: NangoConnection;
        debug?: boolean;
    }): Promise<boolean> {
        jobId = jobId || generateWorkflowId({ id: syncId }, syncName, nangoConnection.connection_id);
        const syncJobId = await createSyncJob(syncId, SyncType.INITIAL, SyncStatus.RUNNING, jobId, nangoConnection);

        if (!syncJobId) {
            return false;
        }

        const args: InitialSyncArgs = { syncId: syncId, syncJobId: syncJobId.id, nangoConnection, syncName, debug: debug === true };

        const handle = await this.client?.workflow.start('initialSync', {
            taskQueue: SYNC_TASK_QUEUE,
            workflowId: jobId,
            args: [args]
        });
        if (!handle) {
            return false;
        }

        await updateRunId(syncJobId.id, handle.firstExecutionRunId);

        return true;
    }
}

export default SyncClient;
