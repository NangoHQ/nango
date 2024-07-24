import { Err, metrics, Ok } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';
import type { TaskPostConnection } from '@nangohq/nango-orchestrator';
import type { Config, SyncConfig, NangoConnection, NangoProps } from '@nangohq/shared';
import { configService, environmentService, getApiUrl, getRunnerFlags, NangoError } from '@nangohq/shared';
import { logContextGetter } from '@nangohq/logs';
import type { DBEnvironment, DBTeam } from '@nangohq/types';
import { startScript } from './operations/start.js';
import { bigQueryClient } from '../clients.js';

export async function startPostConnection(task: TaskPostConnection): Promise<Result<void>> {
    let account: DBTeam | undefined;
    let environment: DBEnvironment | undefined;
    let providerConfig: Config | undefined | null;
    try {
        const accountAndEnv = await environmentService.getAccountAndEnvironment({ environmentId: task.connection.environment_id });
        if (!accountAndEnv) {
            throw new Error(`Account and environment not found`);
        }
        account = accountAndEnv.account;
        environment = accountAndEnv.environment;

        providerConfig = await configService.getProviderConfig(task.connection.provider_config_key, task.connection.environment_id);
        if (providerConfig === null) {
            throw new Error(`Provider config not found for connection: ${task.connection.connection_id}`);
        }

        const logCtx = await logContextGetter.get({ id: String(task.activityLogId) });

        const syncConfig: SyncConfig = {
            sync_name: task.postConnectionName,
            file_location: task.fileLocation,
            models: [],
            track_deletes: false,
            type: 'sync',
            version: task.version,
            active: true,
            auto_start: false,
            enabled: true,
            environment_id: task.connection.environment_id,
            model_schema: [],
            nango_config_id: -1,
            runs: '',
            webhook_subscriptions: [],
            created_at: new Date(),
            updated_at: new Date()
        };

        const nangoProps: NangoProps = {
            scriptType: 'post-connection-script',
            host: getApiUrl(),
            teamId: account.id,
            teamName: account.name,
            connectionId: task.connection.connection_id,
            environmentId: task.connection.environment_id,
            environmentName: environment.name,
            providerConfigKey: task.connection.provider_config_key,
            provider: providerConfig.provider,
            activityLogId: logCtx.id,
            secretKey: environment.secret_key,
            nangoConnectionId: task.connection.id,
            syncConfig: syncConfig,
            debug: false,
            runnerFlags: await getRunnerFlags(),
            startedAt: new Date()
        };

        metrics.increment(metrics.Types.POST_CONNECTION_SCRIPT_EXECUTION, 1, { accountId: account.id });

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
        const error = new NangoError('post_connection_script_failure', { error: err });
        await onFailure({
            connection: {
                id: task.connection.id,
                connection_id: task.connection.connection_id,
                environment_id: task.connection.environment_id,
                provider_config_key: task.connection.provider_config_key
            },
            syncName: task.postConnectionName,
            providerConfigKey: task.connection.provider_config_key,
            activityLogId: task.activityLogId,
            runTime: 0,
            error,
            environment: { id: task.connection.environment_id, name: environment?.name || 'unknown' },
            ...(account?.id && account?.name ? { team: { id: account.id, name: account.name } } : {})
        });
        return Err(error);
    }
}

export async function handlePostConnectionOutput({ nangoProps }: { nangoProps: NangoProps }): Promise<void> {
    const content = `Webhook "${nangoProps.syncConfig.sync_name}" has been run successfully.`;
    void bigQueryClient.insert({
        executionType: 'post-connection-script',
        connectionId: nangoProps.connectionId,
        internalConnectionId: nangoProps.nangoConnectionId,
        accountId: nangoProps.teamId,
        accountName: nangoProps.teamName || 'unknown',
        scriptName: nangoProps.syncConfig.sync_name,
        scriptType: nangoProps.syncConfig.type,
        environmentId: nangoProps.environmentId,
        environmentName: nangoProps.environmentName || 'unknown',
        providerConfigKey: nangoProps.providerConfigKey,
        status: 'success',
        syncId: nangoProps.syncId!,
        content,
        runTimeInSeconds: (new Date().getTime() - nangoProps.startedAt.getTime()) / 1000,
        createdAt: Date.now()
    });
    const logCtx = await logContextGetter.get({ id: String(nangoProps.activityLogId) });
    await logCtx.info(content);
    await logCtx.success();
}

export async function handlePostConnectionError({ nangoProps, error }: { nangoProps: NangoProps; error: NangoError }): Promise<void> {
    await onFailure({
        connection: {
            id: nangoProps.nangoConnectionId!,
            connection_id: nangoProps.connectionId,
            environment_id: nangoProps.environmentId,
            provider_config_key: nangoProps.providerConfigKey
        },
        syncName: nangoProps.syncConfig.sync_name,
        providerConfigKey: nangoProps.providerConfigKey,
        activityLogId: nangoProps.activityLogId!,
        runTime: (new Date().getTime() - nangoProps.startedAt.getTime()) / 1000,
        error,
        environment: { id: nangoProps.environmentId, name: nangoProps.environmentName || 'unknown' },
        ...(nangoProps.teamId && nangoProps.teamName ? { team: { id: nangoProps.teamId, name: nangoProps.teamName } } : {})
    });
}

async function onFailure({
    connection,
    team,
    environment,
    syncName,
    providerConfigKey,
    activityLogId,
    runTime,
    error
}: {
    connection: NangoConnection;
    team?: { id: number; name: string };
    environment: { id: number; name: string };
    syncName: string;
    providerConfigKey: string;
    activityLogId: string;
    runTime: number;
    error: NangoError;
}): Promise<void> {
    if (team) {
        void bigQueryClient.insert({
            executionType: 'post-connection-script',
            connectionId: connection.connection_id,
            internalConnectionId: connection.id,
            accountId: team.id,
            accountName: team.name,
            scriptName: syncName,
            scriptType: 'post-connection-script',
            environmentId: environment.id,
            environmentName: environment.name,
            providerConfigKey: providerConfigKey,
            status: 'failed',
            syncId: null as unknown as string,
            content: error.message,
            runTimeInSeconds: runTime,
            createdAt: Date.now()
        });
    }
    const logCtx = await logContextGetter.get({ id: activityLogId });
    await logCtx.error(error.message, { error });
}
