import { Client, Connection, ScheduleOverlapPolicy, ScheduleDescription } from '@temporalio/client';
import type { NangoConnection, Connection as NangoFullConnection } from '../models/Connection.js';
import ms from 'ms';
import fs from 'fs-extra';
import type { Config as ProviderConfig } from '../models/Provider.js';
import type { NangoIntegrationData, NangoConfig, NangoIntegration } from '../models/NangoConfig.js';
import { Sync, SyncStatus, SyncType, ScheduleStatus, SyncCommand, SyncWithSchedule } from '../models/Sync.js';
import type { ServiceResponse } from '../models/Generic.js';
import { LogActionEnum, LogLevel } from '../models/Activity.js';
import { SYNC_TASK_QUEUE, WEBHOOK_TASK_QUEUE } from '../constants.js';
import {
    createActivityLog,
    createActivityLogMessage,
    createActivityLogMessageAndEnd,
    updateSuccess as updateSuccessActivityLog
} from '../services/activity/activity.service.js';
import { createSyncJob, updateRunId } from '../services/sync/job.service.js';
import { getInterval } from '../services/nango-config.service.js';
import { getSyncConfig } from '../services/sync/config/config.service.js';
import { updateOffset, createSchedule as createSyncSchedule, getScheduleById } from '../services/sync/schedule.service.js';
import connectionService from '../services/connection.service.js';
import configService from '../services/config.service.js';
import { createSync } from '../services/sync/sync.service.js';
import errorManager, { ErrorSourceEnum } from '../utils/error.manager.js';
import { NangoError } from '../utils/error.js';
import { isProd } from '../utils/utils.js';

const generateActionWorkflowId = (actionName: string, connectionId: string) => `${SYNC_TASK_QUEUE}.ACTION:${actionName}.${connectionId}.${Date.now()}`;
const generateWebhookWorkflowId = (parentSyncName: string, webhookName: string, connectionId: string) =>
    `${WEBHOOK_TASK_QUEUE}.WEBHOOK:${parentSyncName}:${webhookName}.${connectionId}.${Date.now()}`;
const generateWorkflowId = (sync: Sync, syncName: string, connectionId: string) => `${SYNC_TASK_QUEUE}.${syncName}.${connectionId}-${sync.id}`;
const generateScheduleId = (sync: Sync, syncName: string, connectionId: string) => `${SYNC_TASK_QUEUE}.${syncName}.${connectionId}-schedule-${sync.id}`;

const OVERLAP_POLICY: ScheduleOverlapPolicy = ScheduleOverlapPolicy.BUFFER_ONE;

const namespace = process.env['TEMPORAL_NAMESPACE'] || 'default';

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
        try {
            const connection = await Connection.connect({
                address: process.env['TEMPORAL_ADDRESS'] || 'localhost:7233',
                tls: isProd()
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

    async initiate(nangoConnectionId: number): Promise<void> {
        const nangoConnection = (await connectionService.getConnectionById(nangoConnectionId)) as NangoConnection;
        const nangoConfig = await getSyncConfig(nangoConnection);
        if (!nangoConfig) {
            console.log(
                'Failed to load the Nango config - will not start any syncs! If you expect to see a sync make sure you used the nango cli deploy command'
            );
            return;
        }
        const { integrations }: NangoConfig = nangoConfig;
        const providerConfigKey = nangoConnection?.provider_config_key as string;

        if (!integrations[providerConfigKey]) {
            console.log(`No syncs registered for provider ${providerConfigKey} - will not start any syncs!`);
            return;
        }

        if (!this.client) {
            console.log('Failed to get a Temporal client - will not start any syncs!');
            return;
        }

        const syncConfig: ProviderConfig = (await configService.getProviderConfig(
            nangoConnection?.provider_config_key as string,
            nangoConnection?.environment_id as number
        )) as ProviderConfig;

        const syncObject = integrations[providerConfigKey] as unknown as { [key: string]: NangoIntegration };
        const syncNames = Object.keys(syncObject);
        for (let k = 0; k < syncNames.length; k++) {
            const syncName = syncNames[k] as string;
            const syncData = syncObject[syncName] as unknown as NangoIntegrationData;

            const sync = await createSync(nangoConnectionId, syncName);

            if (sync) {
                await this.startContinuous(nangoConnection, sync, syncConfig, syncName, syncData);
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
        debug = false
    ): Promise<void> {
        try {
            let activityLogId: number | null = null;

            const log = {
                level: 'info' as LogLevel,
                success: null,
                action: LogActionEnum.SYNC,
                start: Date.now(),
                end: Date.now(),
                timestamp: Date.now(),
                connection_id: nangoConnection?.connection_id as string,
                provider_config_key: nangoConnection?.provider_config_key as string,
                provider: syncConfig.provider,
                session_id: sync?.id?.toString() as string,
                environment_id: nangoConnection?.environment_id as number,
                operation_name: syncName
            };

            if (syncData.auto_start !== false) {
                activityLogId = await createActivityLog(log);
            }

            const { success, error, response } = getInterval(syncData.runs, new Date());

            if (!success || response === null) {
                const content = `The sync was not created or started due to an error with the sync interval "${syncData.runs}": ${error?.message}`;
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id: nangoConnection?.environment_id as number,
                    activity_log_id: activityLogId as number,
                    timestamp: Date.now(),
                    content
                });

                await errorManager.report(content, {
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

                await updateSuccessActivityLog(activityLogId as number, false);

                return;
            }

            let handle = null;
            const jobId = generateWorkflowId(sync, syncName, nangoConnection?.connection_id as string);

            if (syncData.auto_start !== false) {
                if (debug) {
                    await createActivityLogMessage({
                        level: 'debug',
                        environment_id: nangoConnection?.environment_id as number,
                        activity_log_id: activityLogId as number,
                        timestamp: Date.now(),
                        content: `Starting sync job ${jobId} for sync ${sync.id}`
                    });
                }
                const syncJobId = await createSyncJob(sync.id as string, SyncType.INITIAL, SyncStatus.RUNNING, jobId, nangoConnection);

                if (!syncJobId) {
                    return;
                }

                handle = await this.client?.workflow.start('initialSync', {
                    taskQueue: SYNC_TASK_QUEUE,
                    workflowId: jobId,
                    args: [
                        {
                            syncId: sync.id,
                            syncJobId: syncJobId?.id as number,
                            nangoConnection,
                            syncName,
                            activityLogId,
                            debug
                        }
                    ]
                });
                await updateRunId(syncJobId?.id as number, handle?.firstExecutionRunId as string);
            } else {
                await createSyncJob(sync.id as string, SyncType.INITIAL, SyncStatus.PAUSED, jobId, nangoConnection);
            }

            const { interval, offset } = response;
            const scheduleId = generateScheduleId(sync, syncName, nangoConnection?.connection_id as string);

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
                            activityLogId,
                            nangoConnection,
                            syncName,
                            debug
                        }
                    ]
                }
            });

            if (syncData.auto_start === false) {
                await scheduleHandle?.pause();
            }

            await createSyncSchedule(
                sync.id as string,
                interval,
                offset,
                syncData.auto_start === false ? ScheduleStatus.PAUSED : ScheduleStatus.RUNNING,
                scheduleId
            );

            if (syncData.auto_start !== false && handle) {
                await createActivityLogMessage({
                    level: 'info',
                    environment_id: nangoConnection?.environment_id as number,
                    activity_log_id: activityLogId as number,
                    content: `Started initial background sync ${handle?.workflowId} and data updated on a schedule ${scheduleId} at ${syncData.runs} in the task queue: ${SYNC_TASK_QUEUE}`,
                    timestamp: Date.now()
                });
            }
        } catch (e) {
            await errorManager.report(e, {
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
            await errorManager.report(e, {
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
        } catch (e) {
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

    async listSchedules() {
        if (!this.client) {
            return;
        }

        const workflowService = this.client?.workflowService;

        const schedules = await workflowService?.listSchedules({
            namespace: this.namespace
        });

        return schedules;
    }

    async runSyncCommand(scheduleId: string, _syncId: string, command: SyncCommand, activityLogId: number, environmentId: number) {
        const scheduleHandle = this.client?.schedule.getHandle(scheduleId);

        try {
            switch (command) {
                case SyncCommand.PAUSE:
                    {
                        /*
                        // TODO
                        const jobIsRunning = await isSyncJobRunning(syncId);
                        if (jobIsRunning) {
                            const { job_id, run_id } = jobIsRunning;
                            if (run_id) {
                                const workflowHandle = this.client?.workflow.getHandle(job_id, run_id);
                                await workflowHandle?.cancel();
                            }
                        }
                        */

                        await scheduleHandle?.pause();
                    }
                    break;
                case SyncCommand.UNPAUSE:
                    {
                        await scheduleHandle?.unpause();
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
                    console.warn('Not implemented');
                    break;
            }
        } catch (e) {
            const errorMessage = JSON.stringify(e, ['message', 'name', 'stack'], 2);

            await createActivityLogMessageAndEnd({
                level: 'error',
                environment_id: environmentId,
                activity_log_id: activityLogId as number,
                timestamp: Date.now(),
                content: `The sync command: ${command} failed with error: ${errorMessage}`
            });
        }
    }

    async triggerSyncs(syncs: SyncWithSchedule[], environmentId: number) {
        for (const sync of syncs) {
            try {
                const scheduleHandle = this.client?.schedule.getHandle(sync.schedule_id);
                await scheduleHandle?.trigger(OVERLAP_POLICY);
            } catch (e) {
                await errorManager.report(e, {
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

    async triggerAction<T = any>(
        connection: NangoConnection,
        actionName: string,
        input: object,
        activityLogId: number,
        environment_id: number,
        writeLogs = true
    ): Promise<ServiceResponse<T>> {
        const workflowId = generateActionWorkflowId(actionName, connection.connection_id as string);

        try {
            if (writeLogs) {
                await createActivityLogMessage({
                    level: 'info',
                    environment_id,
                    activity_log_id: activityLogId as number,
                    content: `Starting action workflow ${workflowId} in the task queue: ${SYNC_TASK_QUEUE}`,
                    params: {
                        input: JSON.stringify(input, null, 2)
                    },
                    timestamp: Date.now()
                });
            }

            const actionHandler = await this.client?.workflow.execute('action', {
                taskQueue: SYNC_TASK_QUEUE,
                workflowId,
                args: [
                    {
                        actionName,
                        nangoConnection: connection,
                        input,
                        activityLogId: writeLogs ? activityLogId : undefined
                    }
                ]
            });

            const { success, error, response } = actionHandler;

            if (writeLogs && (success === false || error)) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id,
                    activity_log_id: activityLogId as number,
                    timestamp: Date.now(),
                    content: `The action workflow ${workflowId} did not complete successfully`
                });

                return { success, error, response };
            }

            if (writeLogs) {
                await createActivityLogMessageAndEnd({
                    level: 'info',
                    environment_id,
                    activity_log_id: activityLogId as number,
                    timestamp: Date.now(),
                    content: `The action workflow ${workflowId} was successfully run. A truncated response is: ${JSON.stringify(response, null, 2)?.slice(
                        0,
                        100
                    )}`
                });

                await updateSuccessActivityLog(activityLogId as number, true);
            }

            return { success, error, response };
        } catch (e) {
            const errorMessage = JSON.stringify(e, ['message', 'name'], 2);
            const error = new NangoError('action_failure', { errorMessage });

            if (writeLogs) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id,
                    activity_log_id: activityLogId as number,
                    timestamp: Date.now(),
                    content: `The action workflow ${workflowId} failed with error: ${e}`
                });
            }

            await errorManager.report(e, {
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.SYNC_CLIENT,
                environmentId: connection.environment_id,
                metadata: {
                    actionName,
                    connectionDetails: JSON.stringify(connection),
                    input
                }
            });

            return { success: false, error, response: null };
        }
    }

    async triggerWebhook<T = any>(
        nangoConnection: NangoConnection,
        webhookName: string,
        provider: string,
        parentSyncName: string,
        input: object,
        environment_id: number
    ): Promise<ServiceResponse<T>> {
        const log = {
            level: 'info' as LogLevel,
            success: null,
            action: LogActionEnum.WEBHOOK,
            start: Date.now(),
            end: Date.now(),
            timestamp: Date.now(),
            connection_id: nangoConnection?.connection_id as string,
            provider_config_key: nangoConnection?.provider_config_key as string,
            provider,
            environment_id: nangoConnection?.environment_id as number,
            operation_name: webhookName
        };

        const activityLogId = await createActivityLog(log);

        const workflowId = generateWebhookWorkflowId(parentSyncName, webhookName, nangoConnection.connection_id as string);

        try {
            await createActivityLogMessage({
                level: 'info',
                environment_id,
                activity_log_id: activityLogId as number,
                content: `Starting webhook workflow ${workflowId} in the task queue: ${WEBHOOK_TASK_QUEUE}`,
                params: {
                    input: JSON.stringify(input, null, 2)
                },
                timestamp: Date.now()
            });

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
                    environment_id,
                    activity_log_id: activityLogId as number,
                    timestamp: Date.now(),
                    content: `The webhook workflow ${workflowId} did not complete successfully`
                });

                return { success, error, response };
            }

            await createActivityLogMessageAndEnd({
                level: 'info',
                environment_id,
                activity_log_id: activityLogId as number,
                timestamp: Date.now(),
                content: `The webhook workflow ${workflowId} was successfully run.`
            });

            await updateSuccessActivityLog(activityLogId as number, true);

            return { success, error, response };
        } catch (e) {
            const errorMessage = JSON.stringify(e, ['message', 'name'], 2);
            const error = new NangoError('webhook_script_failure', { errorMessage });

            await createActivityLogMessageAndEnd({
                level: 'error',
                environment_id,
                activity_log_id: activityLogId as number,
                timestamp: Date.now(),
                content: `The webhook workflow ${workflowId} failed with error: ${e}`
            });

            await errorManager.report(e, {
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

    async updateSyncSchedule(schedule_id: string, interval: string, offset: number, environmentId: number, syncName?: string, activityLogId?: number) {
        function updateFunction(scheduleDescription: ScheduleDescription) {
            scheduleDescription.spec = {
                intervals: [
                    {
                        every: ms(interval),
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
                    activity_log_id: activityLogId as number,
                    content: `Updated sync "${syncName}" schedule "${schedule_id}" with interval ${interval} and offset ${offset}.`,
                    timestamp: Date.now()
                });
            }
        } catch (e) {
            await errorManager.report(e, {
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
}

export default SyncClient;
