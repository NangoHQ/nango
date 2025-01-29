import { Err, Ok, metrics } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';
import type { TaskAction } from '@nangohq/nango-orchestrator';
import type { Config, NangoConnection } from '@nangohq/shared';
import {
    ErrorSourceEnum,
    LogActionEnum,
    NangoError,
    configService,
    environmentService,
    errorManager,
    featureFlags,
    getApiUrl,
    getEndUserByConnectionId,
    getSyncConfigRaw
} from '@nangohq/shared';
import { logContextGetter } from '@nangohq/logs';
import type { DBEnvironment, DBSyncConfig, DBTeam, NangoProps } from '@nangohq/types';
import { startScript } from './operations/start.js';
import { bigQueryClient, slackService } from '../clients.js';
import { getRunnerFlags } from '../utils/flags.js';
import db from '@nangohq/database';

export async function startAction(task: TaskAction): Promise<Result<void>> {
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

        providerConfig = await configService.getProviderConfig(task.connection.provider_config_key, task.connection.environment_id);
        if (providerConfig === null) {
            throw new Error(`Provider config not found for connection: ${task.connection.connection_id}`);
        }

        syncConfig = await getSyncConfigRaw({
            environmentId: providerConfig.environment_id,
            config_id: providerConfig.id!,
            name: task.actionName,
            isAction: true
        });
        if (!syncConfig) {
            throw new Error(`Action config not found: ${task.id}`);
        }

        const getEndUser = await getEndUserByConnectionId(db.knex, { connectionId: task.connection.id });
        if (getEndUser.isOk()) {
            endUser = { id: getEndUser.value.id, endUserId: getEndUser.value.endUserId, orgId: getEndUser.value.organization?.organizationId || null };
        }

        const logCtx = await logContextGetter.get({ id: String(task.activityLogId) });
        await logCtx.info(`Starting action '${task.actionName}'`, {
            input: task.input,
            action: task.actionName,
            connection: task.connection.connection_id,
            integration: task.connection.provider_config_key
        });

        const nangoProps: NangoProps = {
            scriptType: 'action',
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
            attributes: syncConfig.attributes,
            syncConfig: syncConfig,
            debug: false,
            runnerFlags: await getRunnerFlags(featureFlags),
            startedAt: new Date(),
            endUser
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
            syncConfig,
            environment: { id: task.connection.environment_id, name: environment?.name || 'unknown' },
            ...(account?.id && account?.name ? { team: { id: account.id, name: account.name } } : {}),
            endUser
        });
        return Err(error);
    }
}
export async function handleActionSuccess({ nangoProps }: { nangoProps: NangoProps }): Promise<void> {
    const connection: NangoConnection = {
        id: nangoProps.nangoConnectionId!,
        connection_id: nangoProps.connectionId,
        environment_id: nangoProps.environmentId,
        provider_config_key: nangoProps.providerConfigKey
    };
    await slackService.removeFailingConnection({
        connection,
        name: nangoProps.syncConfig.sync_name,
        type: 'action',
        originalActivityLogId: nangoProps.activityLogId as unknown as string,
        environment_id: nangoProps.environmentId,
        provider: nangoProps.provider
    });

    void bigQueryClient.insert({
        executionType: 'action',
        connectionId: nangoProps.connectionId,
        internalConnectionId: nangoProps.nangoConnectionId,
        accountId: nangoProps.team?.id,
        accountName: nangoProps.team?.name || 'unknown',
        scriptName: nangoProps.syncConfig.sync_name,
        scriptType: nangoProps.syncConfig.type,
        environmentId: nangoProps.environmentId,
        environmentName: nangoProps.environmentName || 'unknown',
        providerConfigKey: nangoProps.providerConfigKey,
        status: 'success',
        syncId: null as unknown as string,
        content: `The action "${nangoProps.syncConfig.sync_name}" has been completed successfully.`,
        runTimeInSeconds: (new Date().getTime() - nangoProps.startedAt.getTime()) / 1000,
        createdAt: Date.now(),
        internalIntegrationId: nangoProps.syncConfig.nango_config_id,
        endUser: nangoProps.endUser
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
        syncConfig: nangoProps.syncConfig,
        ...(nangoProps.team ? { team: { id: nangoProps.team.id, name: nangoProps.team.name } } : {}),
        endUser: nangoProps.endUser
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
    syncConfig,
    runTime,
    error,
    endUser
}: {
    connection: NangoConnection;
    team?: { id: number; name: string };
    environment: { id: number; name: string };
    syncName: string;
    provider: string;
    providerConfigKey: string;
    activityLogId: string;
    syncConfig: DBSyncConfig | null;
    runTime: number;
    error: NangoError;
    endUser: NangoProps['endUser'];
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
            createdAt: Date.now(),
            internalIntegrationId: syncConfig?.nango_config_id || null,
            endUser
        });
    }
    const logCtx = await logContextGetter.get({ id: activityLogId });
    try {
        await slackService.reportFailure(connection, syncName, 'action', logCtx.id, connection.environment_id, provider);
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
}
