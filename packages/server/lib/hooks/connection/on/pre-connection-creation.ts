//import { OtlpSpan, defaultOperationExpiration } from '@nangohq/logs';
import { onEventScriptService } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { getOrchestrator } from '../../../utils/utils.js';

import type { LogContextStateless } from '@nangohq/logs';
import type { ApiKeyCredentials, BasicApiCredentials, Config, NangoError } from '@nangohq/shared';
import type { ConnectionConfig, JwtCredentials, Provider, SignatureCredentials, TbaCredentials } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export async function preConnectionCreation({
    config,
    connectionConfig,
    connectionId,
    credentials,
    provider,
    logCtx
}: {
    config: Config;
    connectionConfig: ConnectionConfig;
    connectionId: string;
    credentials: ApiKeyCredentials | BasicApiCredentials | TbaCredentials | JwtCredentials | SignatureCredentials;
    provider: Provider;
    logCtx: LogContextStateless;
}): Promise<Result<{ tested: boolean }, NangoError>> {
    console.log(config, connectionConfig, connectionId, credentials, provider, logCtx);
    if (!config.id) {
        return Ok({ tested: false });
    }
    const event = 'pre-connection-creation';

    const preConnectionCreationScripts = await onEventScriptService.getByConfig(config.id, event);

    if (preConnectionCreationScripts.length === 0) {
        return Ok({ tested: false });
    }

    for (const script of preConnectionCreationScripts) {
        const { name, file_location: fileLocation, version } = script;

        /*
        const logCtx = await logContextGetter.create(
            { operation: { type: 'events', action: event.replace('-', '_')}, expiresAt: defaultOperationExpiration.action() },
            {
                account,
                environment,
                integration: { id: config_id, name: connection.provider_config_key, provider: provider },
                connection: { id: connection.id, name: connection.connection_id },
                syncConfig: { id: script.id, name: script.name },
                meta: { event }
            }
        );
        */
        //logCtx.attachSpan(new OtlpSpan(logCtx.operation));

        const res = await getOrchestrator().triggerOnEventScript({
            accountId: -1,
            connection: { id: -1, connection_id: connectionId, provider_config_key: config.unique_key, environment_id: -1 },
            version,
            name,
            fileLocation,
            sdkVersion: script.sdk_version,
            async: true,
            // @ts-expect-error we know logCtx is defined here
            logCtx
        });

        if (res.isErr()) {
            // @ts-expect-error should exist
            await logCtx.failed();
            return Err(res.error);
        }
    }

    return Ok({ tested: false });
}
