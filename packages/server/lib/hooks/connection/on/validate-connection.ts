import { connectionService, onEventScriptService } from '@nangohq/shared';
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
    logCtx
}: {
    config: Config;
    connection: DBConnection;
    account: DBTeam;
    logCtx: LogContext;
}): Promise<Result<{ tested: boolean }, NangoError>> {
    if (!config.id) {
        return Ok({ tested: false });
    }
    const event = 'validate-connection';

    const validateConnectionScripts = await onEventScriptService.getByConfig(config.id, event);

    if (validateConnectionScripts.length === 0) {
        return Ok({ tested: false });
    }

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

    return Ok({ tested: true });
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
    error
}: {
    operation: AuthOperationType;
    connection: DBConnection;
    config: Config;
    account: DBTeam;
    environment: DBEnvironment;
    provider: Provider;
    error: NangoError;
}): Promise<string> {
    const message = getValidateConnectionFailureMessage(error);

    if (operation === 'creation') {
        await connectionService.hardDelete(connection.id);
    } else if (operation === 'override') {
        await connectionService.markConnectionAuthFailed({ id: connection.id });
        void reconnectionFailed(
            {
                connection,
                environment,
                account,
                auth_mode: provider.auth_mode,
                error: { type: 'connection_validation_failed', description: message },
                operation: 'override'
            },
            account,
            config
        );
    }

    return message;
}
