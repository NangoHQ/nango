import ms from 'ms';
import type { StringValue } from 'ms';
import type { LogContext, LogContextGetter } from '@nangohq/logs';
import { Err, Ok, stringifyError, metrics, errorToObject } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';
import { NangoError, deserializeNangoError } from '../utils/error.js';
import telemetry, { LogTypes } from '../utils/telemetry.js';
import type { NangoConnection } from '../models/Connection.js';
import { v4 as uuid } from 'uuid';
import errorManager, { ErrorSourceEnum } from '../utils/error.manager.js';
import type { Config as ProviderConfig } from '../models/Provider.js';
import { LogActionEnum } from '../models/Telemetry.js';
import type {
    ExecuteReturn,
    ExecuteActionProps,
    ExecuteWebhookProps,
    ExecuteOnEventProps,
    ExecuteSyncProps,
    VoidReturn,
    OrchestratorTask,
    RecurringProps,
    SchedulesReturn,
    OrchestratorSchedule,
    TaskType
} from '@nangohq/nango-orchestrator';
import type { NangoIntegrationData, Sync, SyncConfig } from '../models/index.js';
import { SyncCommand, SyncStatus } from '../models/index.js';
import tracer from 'dd-trace';
import { clearLastSyncDate } from '../services/sync/sync.service.js';
import { isSyncJobRunning, updateSyncJobStatus } from '../services/sync/job.service.js';
import { getSyncConfigRaw, getSyncConfigBySyncId } from '../services/sync/config/config.service.js';
import environmentService from '../services/environment.service.js';
import type { DBEnvironment, DBTeam } from '@nangohq/types';
import type { RecordCount } from '@nangohq/records';
import type { JsonValue } from 'type-fest';

export interface RecordsServiceInterface {
    deleteRecordsBySyncId({
        connectionId,
        environmentId,
        model,
        syncId
    }: {
        connectionId: number;
        environmentId: number;
        model: string;
        syncId: string;
    }): Promise<{ totalDeletedRecords: number }>;
    getRecordCountsByModel({ connectionId, environmentId }: { connectionId: number; environmentId: number }): Promise<Result<Record<string, RecordCount>>>;
}

export interface OrchestratorClientInterface {
    recurring(props: RecurringProps): Promise<Result<{ scheduleId: string }>>;
    executeAction(props: ExecuteActionProps): Promise<ExecuteReturn>;
    executeWebhook(props: ExecuteWebhookProps): Promise<ExecuteReturn>;
    executeOnEvent(props: ExecuteOnEventProps): Promise<VoidReturn>;
    executeSync(props: ExecuteSyncProps): Promise<VoidReturn>;
    pauseSync({ scheduleName }: { scheduleName: string }): Promise<VoidReturn>;
    unpauseSync({ scheduleName }: { scheduleName: string }): Promise<VoidReturn>;
    deleteSync({ scheduleName }: { scheduleName: string }): Promise<VoidReturn>;
    updateSyncFrequency({ scheduleName, frequencyMs }: { scheduleName: string; frequencyMs: number }): Promise<VoidReturn>;
    cancel({ taskId, reason }: { taskId: string; reason: string }): Promise<Result<OrchestratorTask>>;
    searchSchedules({ scheduleNames, limit }: { scheduleNames: string[]; limit: number }): Promise<SchedulesReturn>;
}

const ScheduleName = {
    get: ({ environmentId, syncId }: { environmentId: number; syncId: string }): string => {
        return `environment:${environmentId}:sync:${syncId}`;
    },
    parse: (scheduleName: string): Result<{ environmentId: number; syncId: string }> => {
        const parts = scheduleName.split(':');
        if (parts.length !== 4 || parts[0] !== 'environment' || isNaN(Number(parts[1])) || parts[2] !== 'sync' || !parts[3] || parts[3].length === 0) {
            return Err(`Invalid schedule name: ${scheduleName}. expected format: environment:<environmentId>:sync:<syncId>`);
        }
        return Ok({ environmentId: Number(parts[1]), syncId: parts[3] });
    }
};

export class Orchestrator {
    private client: OrchestratorClientInterface;

    public constructor(client: OrchestratorClientInterface) {
        this.client = client;
    }

    async searchSchedules(props: { syncId: string; environmentId: number }[]): Promise<Result<Map<string, OrchestratorSchedule>>> {
        const scheduleNames = props.map(({ syncId, environmentId }) => ScheduleName.get({ environmentId, syncId }));
        const schedules = await this.client.searchSchedules({ scheduleNames, limit: scheduleNames.length });
        if (schedules.isErr()) {
            return Err(`Failed to get schedules: ${stringifyError(schedules.error)}`);
        }
        const scheduleMap = schedules.value.reduce((map, schedule) => {
            const parsed = ScheduleName.parse(schedule.name);
            if (parsed.isOk()) {
                map.set(parsed.value.syncId, schedule);
            }
            return map;
        }, new Map<string, OrchestratorSchedule>());
        return Ok(scheduleMap);
    }

    async triggerAction<T = unknown>({
        connection,
        actionName,
        input,
        logCtx
    }: {
        connection: NangoConnection;
        actionName: string;
        input: object;
        logCtx: LogContext;
    }): Promise<Result<T, NangoError>> {
        const activeSpan = tracer.scope().active();
        const spanTags = {
            'action.name': actionName,
            'connection.id': connection.id,
            'connection.connection_id': connection.connection_id,
            'connection.provider_config_key': connection.provider_config_key,
            'connection.environment_id': connection.environment_id
        };

        const span = tracer.startSpan('execute.action', {
            tags: spanTags,
            ...(activeSpan ? { childOf: activeSpan } : {})
        });
        const startTime = Date.now();
        try {
            if (!connection.id) {
                throw new NangoError('invalid_input', { connection });
            }

            let parsedInput: JsonValue = null;
            try {
                parsedInput = input ? JSON.parse(JSON.stringify(input)) : null;
            } catch (err) {
                const errorMsg = `Execute: Failed to parse input '${JSON.stringify(input)}': ${stringifyError(err)}`;
                const error = new NangoError('action_failure', { error: errorMsg });
                throw error;
            }
            const groupKey: TaskType = 'action';
            const executionId = `${groupKey}:environment:${connection.environment_id}:connection:${connection.id}:action:${actionName}:at:${new Date().toISOString()}:${uuid()}`;
            const args = {
                actionName,
                connection: {
                    id: connection.id,
                    connection_id: connection.connection_id,
                    provider_config_key: connection.provider_config_key,
                    environment_id: connection.environment_id
                },
                activityLogId: logCtx.id,
                input: parsedInput
            };
            const actionResult = await this.client.executeAction({
                name: executionId,
                groupKey,
                args
            });

            const res = actionResult.mapError((err) => {
                return (
                    deserializeNangoError(err.payload) ||
                    new NangoError('action_script_failure', {
                        error: err.message,
                        ...(err.payload ? { payload: err.payload } : {})
                    })
                );
            });

            if (res.isErr()) {
                throw res.error;
            }

            const content = `The action was successfully run`;

            await logCtx.info(content, {
                action: actionName,
                connection: connection.connection_id,
                integration: connection.provider_config_key,
                truncated_response: JSON.stringify(res.value)?.slice(0, 100)
            });

            await telemetry.log(
                LogTypes.ACTION_SUCCESS,
                content,
                LogActionEnum.ACTION,
                {
                    input: JSON.stringify(input),
                    environmentId: String(connection.environment_id),
                    connectionId: connection.connection_id,
                    providerConfigKey: connection.provider_config_key,
                    actionName
                },
                `actionName:${actionName}`
            );

            metrics.increment(metrics.Types.ACTION_SUCCESS);
            return res as Result<T, NangoError>;
        } catch (err) {
            let formattedError: NangoError;
            if (err instanceof NangoError) {
                formattedError = err;
            } else {
                formattedError = new NangoError('action_failure', { error: errorToObject(err) });
            }

            const content = `Action '${actionName}' failed`;
            await logCtx.error(content, {
                error: formattedError,
                action: actionName,
                connection: connection.connection_id,
                integration: connection.provider_config_key
            });
            await logCtx.enrichOperation({ error: formattedError });

            errorManager.report(err, {
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
                    error: stringifyError(err),
                    input: JSON.stringify(input),
                    environmentId: String(connection.environment_id),
                    connectionId: connection.connection_id,
                    providerConfigKey: connection.provider_config_key,
                    actionName,
                    level: 'error'
                },
                `actionName:${actionName}`
            );

            metrics.increment(metrics.Types.ACTION_FAILURE);
            span.setTag('error', formattedError);
            return Err(formattedError);
        } finally {
            const endTime = Date.now();
            const totalRunTime = (endTime - startTime) / 1000;
            metrics.duration(metrics.Types.ACTION_TRACK_RUNTIME, totalRunTime);
            span.finish();
        }
    }

    async triggerWebhook<T = unknown>({
        account,
        environment,
        integration,
        connection,
        webhookName,
        syncConfig,
        input,
        logContextGetter
    }: {
        account: DBTeam;
        environment: DBEnvironment;
        integration: ProviderConfig;
        connection: NangoConnection;
        webhookName: string;
        syncConfig: SyncConfig;
        input: object;
        logContextGetter: LogContextGetter;
    }): Promise<Result<T, NangoError>> {
        const activeSpan = tracer.scope().active();
        const spanTags = {
            'webhook.name': webhookName,
            'connection.id': connection.id,
            'connection.connection_id': connection.connection_id,
            'connection.provider_config_key': connection.provider_config_key,
            'connection.environment_id': connection.environment_id
        };

        const span = tracer.startSpan('execute.webhook', {
            tags: spanTags,
            ...(activeSpan ? { childOf: activeSpan } : {})
        });
        const logCtx = await logContextGetter.create(
            { operation: { type: 'webhook', action: 'incoming' }, expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString() },
            {
                account,
                environment,
                integration: { id: integration.id!, name: integration.unique_key, provider: integration.provider },
                connection: { id: connection.id!, name: connection.connection_id },
                syncConfig: { id: syncConfig.id!, name: syncConfig.sync_name }
            }
        );

        try {
            let parsedInput = null;
            try {
                parsedInput = input ? JSON.parse(JSON.stringify(input)) : null;
            } catch (err) {
                const errorMsg = `Execute: Failed to parse input '${JSON.stringify(input)}': ${stringifyError(err)}`;
                const error = new NangoError('webhook_failure', { error: errorMsg });
                throw error;
            }
            const groupKey: TaskType = 'webhook';
            const executionId = `${groupKey}:environment:${connection.environment_id}:connection:${connection.id}:webhook:${webhookName}:at:${new Date().toISOString()}:${uuid()}`;
            const args = {
                webhookName,
                parentSyncName: syncConfig.sync_name,
                connection: {
                    id: connection.id!,
                    connection_id: connection.connection_id,
                    provider_config_key: connection.provider_config_key,
                    environment_id: connection.environment_id
                },
                input: parsedInput,
                activityLogId: logCtx.id
            };
            const webhookResult = await this.client.executeWebhook({
                name: executionId,
                groupKey,
                args
            });
            const res = webhookResult.mapError((err) => {
                return (
                    deserializeNangoError(err.payload) ||
                    new NangoError('webhook_script_failure', { error: err.message, ...(err.payload ? { payload: err.payload } : {}) })
                );
            });

            if (res.isErr()) {
                throw res.error;
            }

            await logCtx.info('The webhook was successfully run', {
                action: webhookName,
                connection: connection.connection_id,
                integration: connection.provider_config_key
            });

            await logCtx.success();

            metrics.increment(metrics.Types.WEBHOOK_SUCCESS);
            return res as Result<T, NangoError>;
        } catch (err) {
            let formattedError: NangoError;
            if (err instanceof NangoError) {
                formattedError = err;
            } else {
                formattedError = new NangoError('webhook_failure', { error: errorToObject(err) });
            }

            await logCtx.error('The webhook failed', {
                error: err,
                webhook: webhookName,
                connection: connection.connection_id,
                integration: connection.provider_config_key
            });
            await logCtx.enrichOperation({ error: formattedError });
            await logCtx.failed();

            errorManager.report(err, {
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.SYNC_CLIENT,
                environmentId: connection.environment_id,
                metadata: {
                    parentSyncName: syncConfig.sync_name,
                    webhookName,
                    connectionDetails: JSON.stringify(connection),
                    input
                }
            });

            metrics.increment(metrics.Types.WEBHOOK_FAILURE);
            span.setTag('error', formattedError);
            return Err(formattedError);
        } finally {
            span.finish();
        }
    }

    async triggerOnEventScript<T = unknown>({
        connection,
        version,
        name,
        fileLocation,
        logCtx
    }: {
        connection: NangoConnection;
        version: string;
        name: string;
        fileLocation: string;
        logCtx: LogContext;
    }): Promise<Result<T, NangoError>> {
        const activeSpan = tracer.scope().active();
        const spanTags = {
            'onEventScript.name': name,
            'connection.id': connection.id,
            'connection.connection_id': connection.connection_id,
            'connection.provider_config_key': connection.provider_config_key,
            'connection.environment_id': connection.environment_id
        };
        const span = tracer.startSpan('execute.onEventScript', {
            tags: spanTags,
            ...(activeSpan ? { childOf: activeSpan } : {})
        });
        const startTime = Date.now();
        try {
            const groupKey: TaskType = 'on-event';
            const executionId = `${groupKey}:environment:${connection.environment_id}:connection:${connection.id}:on-event-script:${name}:at:${new Date().toISOString()}:${uuid()}`;
            const args = {
                onEventName: name,
                connection: {
                    id: connection.id!,
                    connection_id: connection.connection_id,
                    provider_config_key: connection.provider_config_key,
                    environment_id: connection.environment_id
                },
                version,
                activityLogId: logCtx.id,
                fileLocation
            };
            const result = await this.client.executeOnEvent({
                name: executionId,
                groupKey,
                args
            });

            const res = result.mapError((err) => {
                return (
                    deserializeNangoError(err.payload) ||
                    new NangoError('on_event_script_failure', { error: err.message, ...(err.payload ? { payload: err.payload } : {}) })
                );
            });

            if (res.isErr()) {
                throw res.error;
            }

            const content = `Script was successfully run.`;

            await logCtx.info(content, {
                onEventScript: name,
                connection: connection.connection_id,
                integration: connection.provider_config_key
            });

            await telemetry.log(
                LogTypes.ON_EVENT_SCRIPT_SUCCESS,
                content,
                LogActionEnum.ON_EVENT_SCRIPT,
                {
                    environmentId: String(connection.environment_id),
                    connectionId: connection.connection_id,
                    providerConfigKey: connection.provider_config_key,
                    name
                },
                `onEventScript:${name}`
            );

            metrics.increment(metrics.Types.ON_EVENT_SCRIPT_SUCCESS);
            return res as Result<T, NangoError>;
        } catch (err) {
            let formattedError: NangoError;
            if (err instanceof NangoError) {
                formattedError = err;
            } else {
                formattedError = new NangoError('on_event_failure', { error: errorToObject(err) });
            }

            const content = `Script failed`;

            await logCtx.error(content, {
                error: formattedError,
                onEvent: name,
                connection: connection.connection_id,
                integration: connection.provider_config_key
            });
            await logCtx.enrichOperation({ error: formattedError });

            errorManager.report(err, {
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.SYNC_CLIENT,
                environmentId: connection.environment_id,
                metadata: {
                    name,
                    connectionDetails: JSON.stringify(connection)
                }
            });

            await telemetry.log(
                LogTypes.ON_EVENT_SCRIPT_FAILURE,
                content,
                LogActionEnum.ON_EVENT_SCRIPT,
                {
                    environmentId: String(connection.environment_id),
                    connectionId: connection.connection_id,
                    providerConfigKey: connection.provider_config_key,
                    name,
                    level: 'error'
                },
                `onEventScript:${name}`
            );

            metrics.increment(metrics.Types.ON_EVENT_SCRIPT_FAILURE);
            span.setTag('error', formattedError);
            return Err(formattedError);
        } finally {
            const endTime = Date.now();
            const totalRunTime = (endTime - startTime) / 1000;
            metrics.duration(metrics.Types.ON_EVENT_SCRIPT_RUNTIME, totalRunTime);
            span.finish();
        }
    }

    async updateSyncFrequency({
        syncId,
        interval,
        syncName,
        environmentId,
        logCtx
    }: {
        syncId: string;
        interval: string;
        syncName: string;
        environmentId: number;
        logCtx?: LogContext;
    }): Promise<Result<void>> {
        const scheduleName = ScheduleName.get({ environmentId, syncId });

        const frequencyMs = this.getFrequencyMs(interval);
        if (frequencyMs.isErr()) {
            errorManager.report(frequencyMs.error, {
                source: ErrorSourceEnum.CUSTOMER,
                operation: LogActionEnum.SYNC_CLIENT,
                environmentId,
                metadata: {
                    syncName,
                    scheduleName,
                    interval
                }
            });
            return Err(frequencyMs.error);
        }
        const res = await this.client.updateSyncFrequency({ scheduleName, frequencyMs: frequencyMs.value });

        if (res.isErr()) {
            errorManager.report(res.error, {
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.SYNC_CLIENT,
                environmentId,
                metadata: {
                    syncName,
                    scheduleName,
                    interval
                }
            });
        } else {
            await logCtx?.info(`Sync frequency for "${syncName}" is ${interval}`);
        }
        return res;
    }

    async runSyncCommand({
        connectionId,
        syncId,
        command,
        environmentId,
        logCtx,
        recordsService,
        initiator,
        delete_records
    }: {
        connectionId: number;
        syncId: string;
        command: SyncCommand;
        environmentId: number;
        logCtx: LogContext;
        recordsService: RecordsServiceInterface;
        initiator: string;
        delete_records?: boolean;
    }): Promise<Result<void>> {
        try {
            const cancelling = async (syncId: string): Promise<Result<void>> => {
                const syncJob = await isSyncJobRunning(syncId);
                if (!syncJob || !syncJob?.run_id) {
                    return Err(`Sync job not found for syncId: ${syncId}`);
                }
                await updateSyncJobStatus(syncJob.id, SyncStatus.STOPPED);
                await this.client.cancel({ taskId: syncJob?.run_id, reason: initiator });
                return Ok(undefined);
            };

            const scheduleName = ScheduleName.get({ environmentId, syncId });
            let res: Result<void>;
            switch (command) {
                case SyncCommand.CANCEL:
                    res = await cancelling(syncId);
                    break;
                case SyncCommand.PAUSE:
                    res = await this.client.pauseSync({ scheduleName });
                    break;

                case SyncCommand.UNPAUSE:
                    res = await this.client.unpauseSync({ scheduleName });
                    break;
                case SyncCommand.RUN:
                    res = await this.client.executeSync({ scheduleName });
                    break;
                case SyncCommand.RUN_FULL: {
                    await cancelling(syncId);

                    await clearLastSyncDate(syncId);
                    if (delete_records) {
                        const syncConfig = await getSyncConfigBySyncId(syncId);
                        for (const model of syncConfig?.models || []) {
                            const del = await recordsService.deleteRecordsBySyncId({ syncId, connectionId, environmentId, model });
                            await logCtx.info(`Records for model ${model} were deleted successfully`, del);
                        }
                    }

                    res = await this.client.executeSync({ scheduleName });
                    break;
                }
            }
            if (res.isErr()) {
                await logCtx.error(`Sync command '${command}' failed`, { error: res.error, command });
            }
            return res;
        } catch (err) {
            await logCtx.error(`Sync command '${command}' failed`, { error: err, command });

            return Err(err as Error);
        }
    }

    async deleteSync({ syncId, environmentId }: { syncId: string; environmentId: number }): Promise<Result<void>> {
        const res = await this.client.deleteSync({ scheduleName: `environment:${environmentId}:sync:${syncId}` });
        if (res.isErr()) {
            errorManager.report(res.error, {
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.SYNC,
                environmentId,
                metadata: { syncId, environmentId }
            });
        }
        return res;
    }

    async scheduleSync({
        nangoConnection,
        sync,
        providerConfig,
        syncName,
        syncData,
        logContextGetter,
        debug = false
    }: {
        nangoConnection: NangoConnection;
        sync: Sync;
        providerConfig: ProviderConfig;
        syncName: string;
        syncData: NangoIntegrationData;
        logContextGetter: LogContextGetter;
        debug?: boolean;
    }): Promise<Result<void>> {
        let logCtx: LogContext | undefined;

        try {
            const syncConfig = await getSyncConfigRaw({
                environmentId: nangoConnection.environment_id,
                config_id: providerConfig.id!,
                name: syncName,
                isAction: false
            });

            const { account, environment } = (await environmentService.getAccountAndEnvironment({ environmentId: nangoConnection.environment_id }))!;

            logCtx = await logContextGetter.create(
                { operation: { type: 'sync', action: 'init' } },
                {
                    account,
                    environment,
                    integration: { id: providerConfig.id!, name: providerConfig.unique_key, provider: providerConfig.provider },
                    connection: { id: nangoConnection.id!, name: nangoConnection.connection_id },
                    syncConfig: { id: syncConfig!.id, name: syncConfig!.sync_name }
                }
            );

            const frequencyMs = this.getFrequencyMs(syncData.runs);

            if (frequencyMs.isErr()) {
                const content = `The sync was not scheduled due to an error with the sync interval "${syncData.runs}": ${frequencyMs.error.message}`;
                await logCtx.error('The sync was not created or started due to an error with the sync interval', {
                    error: frequencyMs.error,
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

                return Err(frequencyMs.error);
            }

            const groupKey: TaskType = 'sync';
            const schedule = await this.client.recurring({
                name: ScheduleName.get({ environmentId: nangoConnection.environment_id, syncId: sync.id }),
                state: syncData.auto_start ? 'STARTED' : 'PAUSED',
                frequencyMs: frequencyMs.value,
                groupKey,
                retry: { max: 0 },
                timeoutSettingsInSecs: {
                    createdToStarted: 60 * 60, // 1 hour
                    startedToCompleted: 60 * 60 * 24, // 1 day
                    heartbeat: 5 * 60 // 5 minutes
                },
                startsAt: new Date(),
                args: {
                    type: 'sync',
                    syncId: sync.id,
                    syncName,
                    debug,
                    connection: {
                        id: nangoConnection.id!,
                        provider_config_key: nangoConnection.provider_config_key,
                        environment_id: nangoConnection.environment_id,
                        connection_id: nangoConnection.connection_id
                    }
                }
            });

            if (schedule.isErr()) {
                throw schedule.error;
            }

            await logCtx.info('Scheduled successfully', { runs: syncData.runs });
            await logCtx.success();
            return Ok(undefined);
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
            return Err(new Error('Failed to schedule sync', { cause: err }));
        }
    }

    private getFrequencyMs(runs: string): Result<number> {
        const runsMap = new Map([
            ['every half day', '12h'],
            ['every half hour', '30m'],
            ['every quarter hour', '15m'],
            ['every hour', '1h'],
            ['every day', '1d'],
            ['every month', '30d'],
            ['every week', '7d']
        ]);
        const interval = runsMap.get(runs) || runs.replace('every ', '');

        const intervalMs = ms(interval as StringValue);
        if (!intervalMs) {
            const error = new NangoError('sync_interval_invalid');
            return Err(error);
        }

        if (intervalMs < ms('30s')) {
            const error = new NangoError('sync_interval_too_short');
            return Err(error);
        }

        return Ok(intervalMs);
    }
}
