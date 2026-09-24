import db from '@nangohq/database';
import { connectionService, functionConfigService, getFunctionMaxConcurrency, onEventScriptService } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { envs } from '../../../env.js';
import { getOrchestrator } from '../../../utils/utils.js';
import { reconnectionFailed } from '../../hooks.js';

import type { LogContext } from '@nangohq/logs';
import type { Config, NangoError } from '@nangohq/shared';
import type { AuthOperationType, DBConnection, DBEnvironment, DBTeam, Provider } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export async function validateConnection({
    connection,
    config,
    account,
    environment,
    logCtx
}: {
    config: Config;
    connection: DBConnection;
    account: DBTeam;
    environment: DBEnvironment;
    logCtx: LogContext;
}): Promise<Result<{ tested: boolean }, NangoError>> {
    if (!config.id) {
        return Ok({ tested: false });
    }
    const event = 'validate-connection';

    const functions = await functionConfigService.search(db.knex, {
        environmentId: environment.id,
        filter: { integrationKey: config.unique_key, enabled: true, trigger: { kind: 'event', event } }
    });
    if (functions.isErr()) {
        // A function lookup failure is a server error, not a failed connection validation.
        // We let the caller handle it without marking the connection as invalid.
        throw functions.error;
    }

    const validateConnectionScripts = await onEventScriptService.getByConfig(config.id, event);

    for (const script of validateConnectionScripts) {
        const { name, file_location: fileLocation, version } = script;

        const res = await getOrchestrator().triggerOnEventScript({
            accountId: account.id,
            connection: {
                id: connection.id,
                connection_id: connection.connection_id,
                provider_config_key: config.unique_key,
                environment_id: config.environment_id
            },
            version,
            name,
            fileLocation,
            sdkVersion: script.sdk_version,
            async: false,
            maxConcurrency: envs.ON_EVENT_ENVIRONMENT_MAX_CONCURRENCY,
            logCtx
        });

        if (res.isErr()) {
            await logCtx.failed();
            return Err(res.error);
        }
    }

    for (const { config: functionConfig, currentVersion } of functions.value) {
        const res = await getOrchestrator().invokeFunction({
            environment,
            connection,
            functionConfigId: functionConfig.id,
            functionName: functionConfig.name,
            trigger: {
                kind: 'event',
                input: { event },
                connection: { connectionId: connection.connection_id, integrationId: config.unique_key }
            },
            async: false,
            retryMax: 0,
            maxConcurrency: getFunctionMaxConcurrency(currentVersion),
            logCtx
        });
        if (res.isErr()) {
            await logCtx.failed();
            return Err(res.error);
        }
    }

    return Ok({ tested: validateConnectionScripts.length > 0 || functions.value.length > 0 });
}

export function getValidateConnectionFailureMessage(error: NangoError): string {
    const payload = error.payload;
    if (typeof payload?.['message'] === 'string') {
        return payload['message'];
    }
    if (typeof payload?.['error'] === 'string') {
        return payload['error'];
    }
    return 'Connection failed validation';
}

export async function handleValidateConnectionFailure({
    operation,
    connection,
    config,
    account,
    environment,
    provider,
    error,
    logCtx
}: {
    operation: AuthOperationType;
    connection: DBConnection;
    config: Config;
    account: DBTeam;
    environment: DBEnvironment;
    provider: Provider;
    error: NangoError;
    logCtx: LogContext;
}): Promise<string> {
    const message = getValidateConnectionFailureMessage(error);

    if (operation === 'creation') {
        await connectionService.hardDelete(connection.id);
    } else if (operation === 'override') {
        await connectionService.markConnectionAuthFailed({ id: connection.id });
        await reconnectionFailed({
            account,
            connection,
            environment,
            provider,
            config,
            authError: { type: 'connection_validation_failed', description: message },
            logCtx
        });
    }

    return message;
}
