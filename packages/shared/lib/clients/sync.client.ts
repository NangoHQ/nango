import type { ScheduleDescription } from '@temporalio/client';
import { Client, Connection, ScheduleOverlapPolicy } from '@temporalio/client';
import type { NangoConnection, Connection as NangoFullConnection } from '../models/Connection.js';
import type { StringValue } from 'ms';
import ms from 'ms';
import fs from 'fs-extra';
import type { Config, Config as ProviderConfig } from '../models/Provider.js';
import type { NangoIntegrationData, NangoConfig, NangoIntegration } from '../models/NangoConfig.js';
import type { Sync, SyncWithSchedule } from '../models/Sync.js';
import { SyncStatus, SyncType, ScheduleStatus, SyncCommand } from '../models/Sync.js';
import type { ServiceResponse } from '../models/Generic.js';
import type { LogLevel } from '../models/Activity.js';
import { LogActionEnum } from '../models/Activity.js';
import { SYNC_TASK_QUEUE, WEBHOOK_TASK_QUEUE } from '../constants.js';
import {
    createActivityLog,
    createActivityLogMessage,
    createActivityLogMessageAndEnd,
    updateSuccess as updateSuccessActivityLog
} from '../services/activity/activity.service.js';
import { isSyncJobRunning, createSyncJob, updateRunId } from '../services/sync/job.service.js';
import { getInterval } from '../services/nango-config.service.js';
import { getSyncConfig } from '../services/sync/config/config.service.js';
import { updateOffset, createSchedule as createSyncSchedule, getScheduleById } from '../services/sync/schedule.service.js';
import connectionService from '../services/connection.service.js';
import configService from '../services/config.service.js';
import { createSync, clearLastSyncDate } from '../services/sync/sync.service.js';
import telemetry, { LogTypes } from '../utils/telemetry.js';
import errorManager, { ErrorSourceEnum } from '../utils/error.manager.js';
import { NangoError } from '../utils/error.js';
import type { RunnerOutput } from '../models/Runner.js';
import type { LogContext, LogContextGetter } from '@nangohq/logs';
import { isTest, isProd, getLogger, metrics, Ok, Err, stringifyError } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';

const logger = getLogger('Sync.Client');

const generateActionWorkflowId = (actionName: string, connectionId: string) => `${SYNC_TASK_QUEUE}.ACTION:${actionName}.${connectionId}.${Date.now()}`;
const generateWebhookWorkflowId = (parentSyncName: string, webhookName: string, connectionId: string) =>
    `${WEBHOOK_TASK_QUEUE}.WEBHOOK:${parentSyncName}:${webhookName}.${connectionId}.${Date.now()}`;
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

        try {
            const connection = await Connection.connect({
                address: process.env['TEMPORAL_ADDRESS'] || 'localhost:7233',
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
                    address: process.env['TEMPORAL_ADDRESS'] || 'localhost:7233'
                }
            });
            return null;
        }
    }

    async initiate(nangoConnectionId: number, logContextGetter: LogContextGetter): Promise<void> {
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
            logger.info(`No syncs registered for provider ${providerConfigKey} - will not start any syncs!`);
            return;
        }

        if (!this.client) {
            logger.info('Failed to get a Temporal client - will not start any syncs!');
            return;
        }

        const syncConfig: ProviderConfig = (await configService.getProviderConfig(
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
                await this.startContinuous(nangoConnection, sync, syncConfig, syncName, syncData, logContextGetter);
            }
        }
    }

    /**
     * Start Continuous
     * @desc get the connection information and the provider information
     * and kick off an initial sync and also a incremental sync. Also look
     * up any sync configs to call any integration snippet that was setup
     */
    async startContinuous(
        nangoConnection: NangoConnection,
        sync: Sync,
        syncConfig: ProviderConfig,
        syncName: string,
        syncData: NangoIntegrationData,
        logContextGetter: LogContextGetter,
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
                provider: syncConfig.provider,
                session_id: sync?.id?.toString(),
                environment_id: nangoConnection.environment_id,
                operation_name: syncName
            });
            if (!activityLogId) {
                return;
            }

            logCtx = await logContextGetter.create(
                { id: String(activityLogId), operation: { type: 'sync', action: 'init' }, message: 'Sync initialization' },
                { account: { id: nangoConnection.account_id! }, environment: { id: nangoConnection.environment_id }, connection: { id: nangoConnection.id! } }
            );

            const { success, error, response } = getInterval(syncData.runs, new Date());

            if (!success || response === null) {
                const content = `The sync was not created or started due to an error with the sync interval "${syncData.runs}": ${error?.message}`;
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id: nangoConnection.environment_id,
                    activity_log_id: activityLogId,
                    timestamp: Date.now(),
                    content
                });
                await logCtx.error('The sync was not created or started due to an error with the sync interval', { error, runs: syncData.runs });
                await logCtx.failed();

                errorManager.report(content, {
                    source: ErrorSourceEnum.CUSTOMER,
                    operation: LogActionEnum.SYNC_CLIENT,
                    environmentId: nangoConnection.environment_id,
                    metadata: {
                        connectionDetails: nangoConnection,
                        syncConfig,
                        syncName,
                        sync,
                        syncData
                    }
                });

                await updateSuccessActivityLog(activityLogId, false);

                return;
            }

            const jobId = generateWorkflowId(sync, syncName, nangoConnection.connection_id);

            if (syncData.auto_start !== false) {
                if (debug) {
                    await createActivityLogMessage({
                        level: 'debug',
                        environment_id: nangoConnection.environment_id,
                        activity_log_id: activityLogId,
                        timestamp: Date.now(),
                        content: `Creating sync job ${jobId} for sync ${sync.id}`
                    });
                    await logCtx.debug('Creating sync job', { jobId, syncId: sync.id });
                }

                const res = await this.triggerInitialSync({ jobId, nangoConnection, syncId: sync.id, syncName, debug });
                if (!res) {
                    throw new NangoError('failed_to_start_initial_sync');
                }
            } else {
                await createSyncJob(sync.id, SyncType.INITIAL, SyncStatus.PAUSED, jobId, nangoConnection);
            }

            const { interval, offset } = response;
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
                await scheduleHandle.pause();
            }

            await createSyncSchedule(sync.id, interval, offset, syncData.auto_start === false ? ScheduleStatus.PAUSED : ScheduleStatus.RUNNING, scheduleId);

            if (scheduleHandle) {
                await createActivityLogMessageAndEnd({
                    level: 'info',
                    environment_id: nangoConnection.environment_id,
                    activity_log_id: activityLogId,
                    content: `Scheduled to run "${syncData.runs}"`,
                    timestamp: Date.now()
                });
                await logCtx.info('Scheduled successfully', { runs: syncData.runs });
            }

            await updateSuccessActivityLog(activityLogId, true);
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
                    syncConfig,
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
        activityLogId,
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
        activityLogId: number;
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
                        await scheduleHandle?.pause(`${initiator} paused the sync schedule`);
                    }
                    break;
                case SyncCommand.UNPAUSE:
                    {
                        await scheduleHandle?.unpause(`${initiator} unpaused the sync schedule`);
                        await scheduleHandle?.trigger(OVERLAP_POLICY);
                        const schedule = await getScheduleById(scheduleId);
                        if (schedule) {
                            const { frequency } = schedule;
                            const { success, response } = getInterval(frequency, new Date());
                            if (success && response) {
                                const { offset } = response;
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
                        await recordsService.deleteRecordsBySyncId({ syncId });
                        await createActivityLogMessage({
                            level: 'info',
                            environment_id: environmentId,
                            activity_log_id: activityLogId,
                            timestamp: Date.now(),
                            content: `Records for the sync were deleted successfully`
                        });
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
            const errorMessage = stringifyError(err, { pretty: true });

            await createActivityLogMessageAndEnd({
                level: 'error',
                environment_id: environmentId,
                activity_log_id: activityLogId,
                timestamp: Date.now(),
                content: `The sync command: ${command} failed with error: ${errorMessage}`
            });
            await logCtx.error('Sync command failed', { error: err, command });

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

    async triggerAction<T = any>({
        connection,
        actionName,
        input,
        activityLogId,
        environment_id,
        writeLogs = true,
        logCtx
    }: {
        connection: NangoConnection;
        actionName: string;
        input: object;
        activityLogId: number;
        environment_id: number;
        writeLogs?: boolean;
        logCtx: LogContext;
    }): Promise<Result<T, NangoError>> {
        const startTime = Date.now();
        const workflowId = generateActionWorkflowId(actionName, connection.connection_id);

        try {
            if (writeLogs) {
                await createActivityLogMessage({
                    level: 'info',
                    environment_id,
                    activity_log_id: activityLogId,
                    content: `Starting action workflow ${workflowId} in the task queue: ${SYNC_TASK_QUEUE}`,
                    params: {
                        input: JSON.stringify(input, null, 2)
                    },
                    timestamp: Date.now()
                });
                await logCtx.info(`Starting action workflow ${workflowId} in the task queue: ${SYNC_TASK_QUEUE}`, { input: JSON.stringify(input, null, 2) });
            }

            const actionHandler = await this.client?.workflow.execute('action', {
                taskQueue: SYNC_TASK_QUEUE,
                workflowId,
                args: [
                    {
                        actionName,
                        nangoConnection: {
                            id: connection.id,
                            connection_id: connection.connection_id,
                            provider_config_key: connection.provider_config_key,
                            environment_id: connection.environment_id
                        },
                        input,
                        activityLogId: writeLogs ? activityLogId : undefined
                    }
                ]
            });

            const { success, error: rawError, response }: RunnerOutput = actionHandler;

            // Errors received from temporal are raw objects not classes
            const error = rawError ? new NangoError(rawError['type'], rawError['payload'], rawError['status']) : rawError;

            if (!success || error) {
                if (writeLogs) {
                    await createActivityLogMessageAndEnd({
                        level: 'error',
                        environment_id,
                        activity_log_id: activityLogId,
                        timestamp: Date.now(),
                        content: `The action workflow ${workflowId} did not complete successfully`
                    });
                    await logCtx.error(`The action workflow ${workflowId} did not complete successfully`);
                }

                return Err(error!);
            }

            const content = `The action workflow ${workflowId} was successfully run. A truncated response is: ${JSON.stringify(response, null, 2)?.slice(
                0,
                100
            )}`;

            if (writeLogs) {
                await createActivityLogMessageAndEnd({
                    level: 'info',
                    environment_id,
                    activity_log_id: activityLogId,
                    timestamp: Date.now(),
                    content
                });
                await updateSuccessActivityLog(activityLogId, true);
                await logCtx.info(content);
            }

            await telemetry.log(
                LogTypes.ACTION_SUCCESS,
                content,
                LogActionEnum.ACTION,
                {
                    workflowId,
                    input: JSON.stringify(input, null, 2),
                    connection: JSON.stringify(connection),
                    actionName
                },
                `actionName:${actionName}`
            );

            return Ok(response);
        } catch (e) {
            const errorMessage = stringifyError(e, { pretty: true });
            const error = new NangoError('action_failure', { errorMessage });

            const content = `The action workflow ${workflowId} failed with error: ${e}`;

            if (writeLogs) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id,
                    activity_log_id: activityLogId,
                    timestamp: Date.now(),
                    content
                });
                await logCtx.error(content);
            }

            errorManager.report(e, {
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.SYNC_CLIENT,
                environmentId: connection.environment_id,
                metadata: {
                    actionName,
                    connectionDetails: JSON.stringify(connection),
                    input
                }
            });

            await telemetry.log(
                LogTypes.ACTION_FAILURE,
                content,
                LogActionEnum.ACTION,
                {
                    workflowId,
                    input: JSON.stringify(input, null, 2),
                    connection: JSON.stringify(connection),
                    actionName,
                    level: 'error'
                },
                `actionName:${actionName}`
            );

            return Err(error);
        } finally {
            const endTime = Date.now();
            const totalRunTime = (endTime - startTime) / 1000;
            metrics.duration(metrics.Types.ACTION_TRACK_RUNTIME, totalRunTime);
        }
    }

    async triggerWebhook<T = any>(
        integration: Config,
        nangoConnection: NangoConnection,
        webhookName: string,
        parentSyncName: string,
        input: object,
        logContextGetter: LogContextGetter
    ): Promise<ServiceResponse<T>> {
        const log = {
            level: 'info' as LogLevel,
            success: null,
            action: LogActionEnum.WEBHOOK,
            start: Date.now(),
            end: Date.now(),
            timestamp: Date.now(),
            connection_id: nangoConnection?.connection_id,
            provider_config_key: nangoConnection?.provider_config_key,
            provider: integration.provider,
            environment_id: nangoConnection?.environment_id,
            operation_name: webhookName
        };

        const activityLogId = await createActivityLog(log);
        const logCtx = await logContextGetter.create(
            { id: String(activityLogId), operation: { type: 'webhook', action: 'incoming' }, message: 'Received a webhook' },
            { account: { id: nangoConnection.account_id! }, environment: { id: integration.environment_id }, config: { id: integration.id! } }
        );

        const workflowId = generateWebhookWorkflowId(parentSyncName, webhookName, nangoConnection.connection_id);

        try {
            await createActivityLogMessage({
                level: 'info',
                environment_id: integration.environment_id,
                activity_log_id: activityLogId as number,
                content: `Starting webhook workflow ${workflowId} in the task queue: ${WEBHOOK_TASK_QUEUE}`,
                params: {
                    input: JSON.stringify(input, null, 2)
                },
                timestamp: Date.now()
            });
            await logCtx.info('Starting webhook workflow', { workflowId, input });

            const { credentials, credentials_iv, credentials_tag, deleted, deleted_at, ...nangoConnectionWithoutCredentials } =
                nangoConnection as unknown as NangoFullConnection;

            const webhookHandler = await this.client?.workflow.execute('webhook', {
                taskQueue: WEBHOOK_TASK_QUEUE,
                workflowId,
                args: [
                    {
                        name: webhookName,
                        parentSyncName,
                        nangoConnection: nangoConnectionWithoutCredentials,
                        input,
                        activityLogId
                    }
                ]
            });

            const { success, error, response } = webhookHandler;

            if (success === false || error) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id: integration.environment_id,
                    activity_log_id: activityLogId as number,
                    timestamp: Date.now(),
                    content: `The webhook workflow ${workflowId} did not complete successfully`
                });
                await logCtx.error('The webhook workflow did not complete successfully');
                await logCtx.failed();

                return { success, error, response };
            }

            await createActivityLogMessageAndEnd({
                level: 'info',
                environment_id: integration.environment_id,
                activity_log_id: activityLogId as number,
                timestamp: Date.now(),
                content: `The webhook workflow ${workflowId} was successfully run.`
            });
            await logCtx.info('The webhook workflow was successfully run');
            await logCtx.success();

            await updateSuccessActivityLog(activityLogId as number, true);

            return { success, error, response };
        } catch (e) {
            const errorMessage = stringifyError(e, { pretty: true });
            const error = new NangoError('webhook_script_failure', { errorMessage });

            await createActivityLogMessageAndEnd({
                level: 'error',
                environment_id: integration.environment_id,
                activity_log_id: activityLogId as number,
                timestamp: Date.now(),
                content: `The webhook workflow ${workflowId} failed with error: ${errorMessage}`
            });
            await logCtx.error('The webhook workflow failed', { error: e });
            await logCtx.failed();

            errorManager.report(e, {
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.SYNC_CLIENT,
                environmentId: nangoConnection.environment_id,
                metadata: {
                    parentSyncName,
                    webhookName,
                    connectionDetails: JSON.stringify(nangoConnection),
                    input
                }
            });

            return { success: false, error, response: null };
        }
    }

    async updateSyncSchedule(
        schedule_id: string,
        interval: string,
        offset: number,
        environmentId: number,
        syncName?: string,
        activityLogId?: number,
        logCtx?: LogContext
    ) {
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

            if (activityLogId && syncName) {
                await createActivityLogMessage({
                    level: 'info',
                    environment_id: environmentId,
                    activity_log_id: activityLogId,
                    content: `Updated sync "${syncName}" schedule "${schedule_id}" with interval ${interval} and offset ${offset}.`,
                    timestamp: Date.now()
                });
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

        const handle = await this.client?.workflow.start('initialSync', {
            taskQueue: SYNC_TASK_QUEUE,
            workflowId: jobId,
            args: [{ syncId: syncId, syncJobId: syncJobId.id, nangoConnection, syncName, debug }]
        });
        if (!handle) {
            return false;
        }

        await updateRunId(syncJobId.id, handle.firstExecutionRunId);

        return true;
    }
}

export default SyncClient;
