import { Err, Ok, metrics } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';
import type { TaskAction } from '@nangohq/nango-orchestrator';
import type { Config, NangoConnection, NangoProps } from '@nangohq/shared';
import {
    ErrorSourceEnum,
    LogActionEnum,
    NangoError,
    configService,
    environmentService,
    errorManager,
    getApiUrl,
    getRunnerFlags,
    getSyncConfigRaw
} from '@nangohq/shared';
import { logContextGetter } from '@nangohq/logs';
import type { DBEnvironment, DBTeam } from '@nangohq/types';
import { startScript } from './operations/start.js';
import { bigQueryClient, slackService } from '../clients.js';

export async function startAction(task: TaskAction): Promise<Result<void>> {
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

        const syncConfig = await getSyncConfigRaw({
            environmentId: providerConfig.environment_id,
            config_id: providerConfig.id!,
            name: task.actionName,
            isAction: true
        });
        if (!syncConfig) {
            throw new Error(`Action config not found: ${task.id}`);
        }

        const logCtx = await logContextGetter.get({ id: String(task.activityLogId) });

        const nangoProps: NangoProps = {
            scriptType: 'action',
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
            attributes: syncConfig.attributes,
            syncConfig: syncConfig,
            debug: false,
            runnerFlags: await getRunnerFlags(),
            startedAt: new Date()
        };

        metrics.increment(metrics.Types.ACTION_EXECUTION, 1, { accountId: account.id });

        const res = await startScript({
            taskId: task.id,
            nangoProps,
            logCtx: logCtx,
            input: task.input
        });

        if (res.isErr()) {
            throw res.error;
        }

        return Ok(undefined);
    } catch (err) {
        const error = new NangoError('action_script_failure', { error: err instanceof Error ? err.message : err });
        await onFailure({
            connection: {
                id: task.connection.id,
                connection_id: task.connection.connection_id,
                environment_id: task.connection.environment_id,
                provider_config_key: task.connection.provider_config_key
            },
            syncName: task.actionName,
            provider: providerConfig?.provider || 'unknown',
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
export async function handleActionOutput({ nangoProps }: { nangoProps: NangoProps }): Promise<void> {
    const logCtx = await logContextGetter.get({ id: String(nangoProps.activityLogId) });
    const content = `${nangoProps.syncConfig.sync_name} action was run successfully and results are being sent synchronously.`;

    await logCtx.info(content);

    const connection: NangoConnection = {
        id: nangoProps.nangoConnectionId!,
        connection_id: nangoProps.connectionId,
        environment_id: nangoProps.environmentId,
        provider_config_key: nangoProps.providerConfigKey
    };
    await slackService.removeFailingConnection(
        connection,
        nangoProps.syncConfig.sync_name,
        'action',
        nangoProps.activityLogId as unknown as string,
        nangoProps.environmentId,
        nangoProps.provider
    );

    void bigQueryClient.insert({
        executionType: 'action',
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
        syncId: null as unknown as string,
        content: `The action "${nangoProps.syncConfig.sync_name}" has been completed successfully.`,
        runTimeInSeconds: (new Date().getTime() - nangoProps.startedAt.getTime()) / 1000,
        createdAt: Date.now()
    });
}

export async function handleActionError({ nangoProps, error }: { nangoProps: NangoProps; error: NangoError }): Promise<void> {
    await onFailure({
        connection: {
            id: nangoProps.nangoConnectionId!,
            connection_id: nangoProps.connectionId,
            environment_id: nangoProps.environmentId,
            provider_config_key: nangoProps.providerConfigKey
        },
        syncName: nangoProps.syncConfig.sync_name,
        provider: nangoProps.provider,
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
    provider,
    providerConfigKey,
    activityLogId,
    runTime,
    error
}: {
    connection: NangoConnection;
    team?: { id: number; name: string };
    environment: { id: number; name: string };
    syncName: string;
    provider: string;
    providerConfigKey: string;
    activityLogId: string;
    runTime: number;
    error: NangoError;
}): Promise<void> {
    if (team) {
        void bigQueryClient.insert({
            executionType: 'action',
            connectionId: connection.connection_id,
            internalConnectionId: connection.id,
            accountId: team.id,
            accountName: team.name,
            scriptName: syncName,
            scriptType: 'action',
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
    try {
        await slackService.reportFailure(connection, syncName, 'sync', logCtx.id, connection.environment_id, provider);
    } catch {
        errorManager.report('slack notification service reported a failure', {
            environmentId: connection.environment_id,
            source: ErrorSourceEnum.PLATFORM,
            operation: LogActionEnum.ACTION,
            metadata: {
                syncName: syncName,
                connectionDetails: connection,
                syncType: 'action',
                debug: false
            }
        });
    }
    await logCtx.error(error.message, { error });
}
