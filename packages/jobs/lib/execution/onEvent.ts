import db from '@nangohq/database';
import { logContextGetter } from '@nangohq/logs';
import { NangoError, configService, environmentService, getApiUrl, getEndUserByConnectionId } from '@nangohq/shared';
import { Err, Ok, metrics, tagTraceUser } from '@nangohq/utils';

import { bigQueryClient } from '../clients.js';
import { startScript } from './operations/start.js';
import { getRunnerFlags } from '../utils/flags.js';
import { setTaskFailed, setTaskSuccess } from './operations/state.js';

import type { TaskOnEvent } from '@nangohq/nango-orchestrator';
import type { Config } from '@nangohq/shared';
import type { ConnectionJobs, DBEnvironment, DBSyncConfig, DBTeam, NangoProps } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export async function startOnEvent(task: TaskOnEvent): Promise<Result<void>> {
    let account: DBTeam | undefined;
    let environment: DBEnvironment | undefined;
    let providerConfig: Config | undefined | null;
    let syncConfig: DBSyncConfig | null = null;
    let endUser: NangoProps['endUser'] | null = null;

    try {
        const accountAndEnv = await environmentService.getAccountAndEnvironment({ environmentId: task.connection.environment_id });
        if (!accountAndEnv) {
            throw new Error(`Account and environment not found`);
        }
        account = accountAndEnv.account;
        environment = accountAndEnv.environment;
        tagTraceUser(accountAndEnv);

        providerConfig = await configService.getProviderConfig(task.connection.provider_config_key, task.connection.environment_id);
        if (providerConfig === null) {
            throw new Error(`Provider config not found for connection: ${task.connection.connection_id}`);
        }

        const getEndUser = await getEndUserByConnectionId(db.knex, { connectionId: task.connection.id });
        if (getEndUser.isOk()) {
            endUser = { id: getEndUser.value.id, endUserId: getEndUser.value.endUserId, orgId: getEndUser.value.organization?.organizationId || null };
        }

        const logCtx = logContextGetter.get({ id: String(task.activityLogId), accountId: account.id });

        void logCtx.info(`Starting script '${task.onEventName}'`, {
            postConnection: task.onEventName,
            connection: task.connection.connection_id,
            integration: task.connection.provider_config_key
        });

        syncConfig = {
            id: -1,
            sync_name: task.onEventName,
            file_location: task.fileLocation,
            models: [],
            track_deletes: false,
            type: 'sync',
            version: task.version,
            active: true,
            auto_start: false,
            enabled: true,
            environment_id: task.connection.environment_id,
            nango_config_id: -1,
            runs: '',
            model_schema: null,
            webhook_subscriptions: [],
            attributes: {},
            input: null,
            is_public: false,
            metadata: {},
            models_json_schema: null,
            pre_built: false,
            sync_type: null,
            sdk_version: null,
            created_at: new Date(),
            updated_at: new Date()
        };

        const nangoProps: NangoProps = {
            scriptType: 'on-event',
            host: getApiUrl(),
            team: {
                id: account.id,
                name: account.name
            },
            connectionId: task.connection.connection_id,
            environmentId: task.connection.environment_id,
            environmentName: environment.name,
            providerConfigKey: task.connection.provider_config_key,
            provider: providerConfig.provider,
            activityLogId: logCtx.id,
            secretKey: environment.secret_key,
            nangoConnectionId: task.connection.id,
            syncConfig,
            debug: false,
            runnerFlags: await getRunnerFlags(),
            startedAt: new Date(),
            endUser
        };

        metrics.increment(metrics.Types.ON_EVENT_SCRIPT_EXECUTION, 1, { accountId: account.id });

        const res = await startScript({
            taskId: task.id,
            nangoProps,
            logCtx: logCtx
        });

        if (res.isErr()) {
            throw res.error;
        }

        return Ok(undefined);
    } catch (err) {
        const error = new NangoError('on_event_script_failure', { error: err instanceof Error ? err.message : err });
        onFailure({
            connection: {
                id: task.connection.id,
                connection_id: task.connection.connection_id,
                environment_id: task.connection.environment_id,
                provider_config_key: task.connection.provider_config_key
            },
            syncName: task.onEventName,
            providerConfigKey: task.connection.provider_config_key,
            activityLogId: task.activityLogId,
            runTime: 0,
            error,
            environment: { id: task.connection.environment_id, name: environment?.name || 'unknown' },
            syncConfig,
            ...(account?.id && account?.name ? { team: { id: account.id, name: account.name } } : {}),
            endUser
        });
        return Err(error);
    }
}

export async function handleOnEventSuccess({ taskId, nangoProps }: { taskId: string; nangoProps: NangoProps }): Promise<void> {
    await setTaskSuccess({ taskId, output: null });

    const logCtx = logContextGetter.get({ id: String(nangoProps.activityLogId), accountId: nangoProps.team.id });
    await logCtx.success();

    const content = `Script "${nangoProps.syncConfig.sync_name}" has been run successfully.`;
    void bigQueryClient.insert({
        executionType: 'on-event',
        connectionId: nangoProps.connectionId,
        internalConnectionId: nangoProps.nangoConnectionId,
        accountId: nangoProps.team.id,
        accountName: nangoProps.team.name,
        scriptName: nangoProps.syncConfig.sync_name,
        scriptType: nangoProps.syncConfig.type,
        environmentId: nangoProps.environmentId,
        environmentName: nangoProps.environmentName,
        providerConfigKey: nangoProps.providerConfigKey,
        status: 'success',
        syncId: null as unknown as string,
        syncVariant: null as unknown as string,
        content,
        runTimeInSeconds: (new Date().getTime() - nangoProps.startedAt.getTime()) / 1000,
        createdAt: Date.now(),
        internalIntegrationId: nangoProps.syncConfig.nango_config_id,
        endUser: nangoProps.endUser
    });
}

export async function handleOnEventError({ taskId, nangoProps, error }: { taskId: string; nangoProps: NangoProps; error: NangoError }): Promise<void> {
    await setTaskFailed({ taskId, error });

    onFailure({
        connection: {
            id: nangoProps.nangoConnectionId,
            connection_id: nangoProps.connectionId,
            environment_id: nangoProps.environmentId,
            provider_config_key: nangoProps.providerConfigKey
        },
        syncName: nangoProps.syncConfig.sync_name,
        providerConfigKey: nangoProps.providerConfigKey,
        activityLogId: nangoProps.activityLogId,
        runTime: (new Date().getTime() - nangoProps.startedAt.getTime()) / 1000,
        error,
        environment: { id: nangoProps.environmentId, name: nangoProps.environmentName || 'unknown' },
        syncConfig: nangoProps.syncConfig,
        ...(nangoProps.team ? { team: { id: nangoProps.team.id, name: nangoProps.team.name } } : {}),
        endUser: nangoProps.endUser
    });
}

function onFailure({
    connection,
    team,
    environment,
    syncName,
    providerConfigKey,
    activityLogId,
    syncConfig,
    runTime,
    error,
    endUser
}: {
    connection: ConnectionJobs;
    team?: { id: number; name: string };
    environment: { id: number; name: string };
    syncName: string;
    providerConfigKey: string;
    activityLogId: string;
    syncConfig: DBSyncConfig | null;
    runTime: number;
    error: NangoError;
    endUser: NangoProps['endUser'];
}): void {
    const logCtx = team ? logContextGetter.get({ id: activityLogId, accountId: team.id }) : null;
    void logCtx?.error(error.message, { error });

    if (team) {
        void bigQueryClient.insert({
            executionType: 'on-event',
            connectionId: connection.connection_id,
            internalConnectionId: connection.id,
            accountId: team.id,
            accountName: team.name,
            scriptName: syncName,
            scriptType: 'on-event',
            environmentId: environment.id,
            environmentName: environment.name,
            providerConfigKey: providerConfigKey,
            status: 'failed',
            syncId: null as unknown as string,
            syncVariant: null as unknown as string,
            content: error.message,
            runTimeInSeconds: runTime,
            createdAt: Date.now(),
            internalIntegrationId: syncConfig?.nango_config_id || null,
            endUser
        });
    }
}
