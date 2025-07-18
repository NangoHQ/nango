import tracer from 'dd-trace';
import ms from 'ms';
import { v4 as uuid } from 'uuid';

import { OtlpSpan } from '@nangohq/logs';
import { Err, Ok, errorToObject, metrics, stringifyError } from '@nangohq/utils';

import { LogActionEnum } from '../models/Telemetry.js';
import { SyncCommand, SyncStatus } from '../models/index.js';
import environmentService from '../services/environment.service.js';
import { getSyncConfigBySyncId, getSyncConfigRaw } from '../services/sync/config/config.service.js';
import { isSyncJobRunning, updateSyncJobStatus } from '../services/sync/job.service.js';
import { clearLastSyncDate } from '../services/sync/sync.service.js';
import { NangoError, deserializeNangoError } from '../utils/error.js';
import errorManager, { ErrorSourceEnum } from '../utils/error.manager.js';

import type { Config as ProviderConfig } from '../models/Provider.js';
import type { NangoIntegrationData, Sync } from '../models/index.js';
import type { LogContext, LogContextGetter, LogContextOrigin } from '@nangohq/logs';
import type {
    ExecuteActionProps,
    ExecuteAsyncReturn,
    ExecuteOnEventProps,
    ExecuteReturn,
    ExecuteSyncProps,
    ExecuteWebhookProps,
    OrchestratorSchedule,
    OrchestratorTask,
    RecurringProps,
    SchedulesReturn,
    TaskType,
    VoidReturn
} from '@nangohq/nango-orchestrator';
import type { RecordCount } from '@nangohq/records';
import type {
    AsyncActionResponse,
    ConnectionInternal,
    ConnectionJobs,
    DBConnection,
    DBConnectionDecrypted,
    DBEnvironment,
    DBSyncConfig,
    DBTeam
} from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { StringValue } from 'ms';
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

// TODO: move to @nangohq/types (with the rest of the ochestrator public types)
export interface OrchestratorClientInterface {
    recurring(props: RecurringProps): Promise<Result<{ scheduleId: string }>>;
    executeAction(props: ExecuteActionProps): Promise<ExecuteReturn>;
    executeActionAsync(props: ExecuteActionProps): Promise<ExecuteAsyncReturn>;
    executeWebhook(props: ExecuteWebhookProps): Promise<ExecuteReturn>;
    executeOnEvent(props: ExecuteOnEventProps & { async: boolean }): Promise<VoidReturn>;
    executeSync(props: ExecuteSyncProps): Promise<VoidReturn>;
    pauseSync({ scheduleName }: { scheduleName: string }): Promise<VoidReturn>;
    unpauseSync({ scheduleName }: { scheduleName: string }): Promise<VoidReturn>;
    deleteSync({ scheduleName }: { scheduleName: string }): Promise<VoidReturn>;
    updateSyncFrequency({ scheduleName, frequencyMs }: { scheduleName: string; frequencyMs: number }): Promise<VoidReturn>;
    cancel({ taskId, reason }: { taskId: string; reason: string }): Promise<Result<OrchestratorTask>>;
    searchSchedules({ scheduleNames, limit }: { scheduleNames: string[]; limit: number }): Promise<SchedulesReturn>;
    getOutput({ retryKey, ownerKey }: { retryKey: string; ownerKey: string }): Promise<ExecuteReturn>;
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
        accountId,
        connection,
        actionName,
        input,
        retryMax,
        async,
        logCtx
    }: {
        accountId: number;
        connection: DBConnection | DBConnectionDecrypted;
        actionName: string;
        input: object;
        retryMax: number;
        async: boolean;
        logCtx: LogContext;
    }): Promise<Result<AsyncActionResponse | { data: T }, NangoError>> {
        const activeSpan = tracer.scope().active();
        const spanTags = {
            'account.id': accountId,
            'action.name': actionName,
            'connection.id': connection.id,
            'connection.connection_id': connection.connection_id,
            'connection.provider_config_key': connection.provider_config_key,
            'connection.environment_id': connection.environment_id,
            async
        };

        const span = tracer.startSpan('execute.action', {
            tags: spanTags,
            ...(activeSpan ? { childOf: activeSpan } : {})
        });
        const startTime = Date.now();
        try {
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
                input: parsedInput,
                async
            };

            if (async) {
                const res = await this.client.executeActionAsync({
                    name: executionId,
                    group: { key: `action:environment:${connection.environment_id}`, maxConcurrency: 1 }, // async actions runs sequentially per environment
                    retry: { count: 0, max: retryMax },
                    ownerKey: `environment:${connection.environment_id}`,
                    args
                });
                if (res.isErr()) {
                    throw res.error;
                }
                void logCtx.info('The action was successfully scheduled for asynchronous execution', {
                    action: actionName,
                    connection: connection.connection_id,
                    integration: connection.provider_config_key
                });
                const { retryKey } = res.value;
                return Ok({ id: retryKey, statusUrl: `/action/${retryKey}` });
            }

            const actionResult = await this.client.executeAction({
                name: executionId,
                group: { key: groupKey, maxConcurrency: 0 },
                ownerKey: getActionOwnerKey(connection.environment_id),
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

            void logCtx.enrichOperation({
                meta: { truncated_response: JSON.stringify(res.value)?.slice(0, 100) }
            });

            return Ok({ data: res.value as T });
        } catch (err) {
            let formattedError: NangoError;
            if (err instanceof NangoError) {
                formattedError = err;
            } else {
                formattedError = new NangoError('action_failure', { error: errorToObject(err) });
            }

            span.setTag('error', formattedError);
            return Err(formattedError);
        } finally {
            // only track duration when action is executed inline
            if (!async) {
                const endTime = Date.now();
                const totalRunTime = (endTime - startTime) / 1000;
                metrics.duration(metrics.Types.ACTION_TRACK_RUNTIME, totalRunTime);
            }
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
        connection: ConnectionJobs;
        webhookName: string;
        syncConfig: DBSyncConfig;
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
                connection: { id: connection.id, name: connection.connection_id },
                syncConfig: { id: syncConfig.id, name: syncConfig.sync_name }
            }
        );
        logCtx.attachSpan(new OtlpSpan(logCtx.operation));

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
                    id: connection.id,
                    connection_id: connection.connection_id,
                    provider_config_key: connection.provider_config_key,
                    environment_id: connection.environment_id
                },
                input: parsedInput,
                activityLogId: logCtx.id
            };
            const webhookResult = await this.client.executeWebhook({
                name: executionId,
                group: { key: groupKey, maxConcurrency: 0 },
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

            void logCtx.info('The webhook was successfully scheduled for immediate execution', {
                action: webhookName,
                connection: connection.connection_id,
                integration: connection.provider_config_key
            });

            return res as Result<T, NangoError>;
        } catch (err) {
            let formattedError: NangoError;
            if (err instanceof NangoError) {
                formattedError = err;
            } else {
                formattedError = new NangoError('webhook_failure', { error: errorToObject(err) });
            }

            void logCtx.error('The webhook failed', {
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

            span.setTag('error', formattedError);
            return Err(formattedError);
        } finally {
            span.finish();
        }
    }

    async triggerOnEventScript<T = unknown>({
        accountId,
        connection,
        version,
        name,
        fileLocation,
        sdkVersion,
        async,
        logCtx
    }: {
        accountId: number;
        connection: ConnectionJobs;
        version: string;
        name: string;
        fileLocation: string;
        sdkVersion: string | null;
        async: boolean;
        logCtx: LogContext;
    }): Promise<Result<T, NangoError>> {
        const activeSpan = tracer.scope().active();
        const spanTags = {
            'account.id': accountId,
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
            const args: ExecuteOnEventProps['args'] = {
                onEventName: name,
                connection: {
                    id: connection.id,
                    connection_id: connection.connection_id,
                    provider_config_key: connection.provider_config_key,
                    environment_id: connection.environment_id
                },
                version,
                activityLogId: logCtx.id,
                fileLocation,
                sdkVersion: sdkVersion
            };
            const result = await this.client.executeOnEvent({
                name: executionId,
                group: { key: groupKey, maxConcurrency: 0 },
                args,
                async
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

            void logCtx.info(content, {
                onEventScript: name,
                connection: connection.connection_id,
                integration: connection.provider_config_key
            });

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

            void logCtx.error(content, {
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

    async getActionOutput(props: { retryKey: string; environmentId: number }): Promise<Result<JsonValue, NangoError>> {
        const res = await this.client.getOutput({
            retryKey: props.retryKey,
            ownerKey: getActionOwnerKey(props.environmentId)
        });
        if (res.isErr()) {
            return Err(
                deserializeNangoError(res.error.payload) ||
                    new NangoError('action_script_failure', {
                        error: res.error.message,
                        ...(res.error.payload ? { payload: res.error.payload } : {})
                    })
            );
        }
        return Ok(res.value);
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
            void logCtx?.info(`Sync frequency for "${syncName}" is ${interval}`);
        }
        return res;
    }

    async runSyncCommand({
        connectionId,
        syncId,
        syncVariant,
        command,
        environmentId,
        logCtx,
        recordsService,
        initiator,
        delete_records
    }: {
        connectionId: number;
        syncId: string;
        syncVariant: string;
        command: SyncCommand;
        environmentId: number;
        logCtx: LogContext;
        recordsService: RecordsServiceInterface;
        initiator: string;
        delete_records?: boolean | undefined;
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
                        for (let model of syncConfig?.models || []) {
                            if (syncVariant !== 'base') {
                                model = `${model}::${syncVariant}`;
                            }
                            const del = await recordsService.deleteRecordsBySyncId({ syncId, connectionId, environmentId, model });
                            void logCtx.info(`Records for model ${model} were deleted successfully`, del);
                        }
                    }

                    res = await this.client.executeSync({ scheduleName });
                    break;
                }
            }
            if (res.isErr()) {
                void logCtx.error(`Sync command '${command}' failed`, { error: res.error, command });
            }
            return res;
        } catch (err) {
            void logCtx.error(`Sync command '${command}' failed`, { error: err, command });

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
    async pauseSync({ syncId, environmentId }: { syncId: string; environmentId: number }): Promise<Result<void>> {
        const res = await this.client.pauseSync({ scheduleName: `environment:${environmentId}:sync:${syncId}` });
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

    async unpauseSync({ syncId, environmentId }: { syncId: string; environmentId: number }): Promise<Result<void>> {
        const res = await this.client.unpauseSync({ scheduleName: `environment:${environmentId}:sync:${syncId}` });
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
        syncVariant,
        syncData,
        logContextGetter,
        debug = false
    }: {
        nangoConnection: ConnectionInternal;
        sync: Sync;
        providerConfig: ProviderConfig;
        syncName: string;
        syncVariant: string;
        syncData: Pick<NangoIntegrationData, 'runs' | 'auto_start'>;
        logContextGetter: LogContextGetter;
        debug?: boolean;
    }): Promise<Result<void>> {
        let logCtx: LogContextOrigin | undefined;

        try {
            const syncConfig = await getSyncConfigRaw({
                environmentId: nangoConnection.environment_id,
                config_id: providerConfig.id!,
                name: syncName,
                isAction: false
            });
            if (!syncConfig) {
                throw new Error(`Sync not found: ${sync.id}`);
            }
            if (!syncConfig.enabled) {
                throw new Error(`Sync is disabled: ${sync.id}`);
            }

            const { account, environment } = (await environmentService.getAccountAndEnvironment({ environmentId: nangoConnection.environment_id }))!;

            logCtx = await logContextGetter.create(
                { operation: { type: 'sync', action: 'init' } },
                {
                    account,
                    environment,
                    integration: { id: providerConfig.id!, name: providerConfig.unique_key, provider: providerConfig.provider },
                    connection: { id: nangoConnection.id, name: nangoConnection.connection_id },
                    syncConfig: { id: syncConfig.id, name: syncConfig.sync_name }
                }
            );

            const frequencyMs = this.getFrequencyMs(syncData.runs!);

            if (frequencyMs.isErr()) {
                const content = `The sync was not scheduled due to an error with the sync interval "${syncData.runs}": ${frequencyMs.error.message}`;
                void logCtx.error('The sync was not created or started due to an error with the sync interval', {
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
                        syncVariant,
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
                group: { key: groupKey, maxConcurrency: 0 },
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
                    syncVariant,
                    debug,
                    connection: {
                        id: nangoConnection.id,
                        provider_config_key: nangoConnection.provider_config_key,
                        environment_id: nangoConnection.environment_id,
                        connection_id: nangoConnection.connection_id
                    }
                }
            });

            if (schedule.isErr()) {
                throw schedule.error;
            }

            void logCtx.info('Scheduled successfully', { runs: syncData.runs });
            await logCtx.success();
            return Ok(undefined);
        } catch (err) {
            errorManager.report(err, {
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.SYNC_CLIENT,
                environmentId: nangoConnection.environment_id,
                metadata: {
                    syncName,
                    syncVariant,
                    connectionDetails: JSON.stringify(nangoConnection),
                    syncId: sync.id,
                    providerConfig,
                    syncData: JSON.stringify(syncData)
                }
            });
            if (logCtx) {
                void logCtx.error('Failed to init sync', { error: err });
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

function getActionOwnerKey(environmentId: number): string {
    return `environment:${environmentId}`;
}
