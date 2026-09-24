import db from '@nangohq/database';
import { defaultOperationExpiration, OtlpSpan } from '@nangohq/logs';
import { functionConfigService, getFunctionMaxConcurrency, onEventScriptService } from '@nangohq/shared';

import { envs } from '../../../env.js';
import { getOrchestrator } from '../../../utils/utils.js';

import type { LogContextGetter } from '@nangohq/logs';
import type { RecentlyCreatedConnection } from '@nangohq/types';

export async function postConnectionCreation(
    createdConnection: RecentlyCreatedConnection,
    provider: string,
    logContextGetter: LogContextGetter
): Promise<void> {
    if (!createdConnection) {
        return;
    }
    const { environment, account, connection } = createdConnection;
    const { config_id } = connection;

    if (!config_id || !connection.id) {
        return;
    }

    const event = 'post-connection-creation';

    const createLogCtx = async (id: number, name: string) => {
        const logCtx = await logContextGetter.create(
            { operation: { type: 'events', action: 'post_connection_creation' }, expiresAt: defaultOperationExpiration.action() },
            {
                account,
                environment,
                integration: { id: config_id, name: connection.provider_config_key, provider },
                connection: { id: connection.id, name: connection.connection_id },
                syncConfig: { id, name },
                meta: { event }
            }
        );
        logCtx.attachSpan(new OtlpSpan(logCtx.operation));
        return logCtx;
    };

    const functions = await functionConfigService.search(db.knex, {
        environmentId: environment.id,
        filter: { integrationKey: connection.provider_config_key, enabled: true, trigger: { kind: 'event', event } }
    });
    if (functions.isErr()) {
        throw functions.error;
    }

    if (functions.value.length === 0) {
        const postConnectionCreationScripts = await onEventScriptService.getByConfig(config_id, event);

        for (const script of postConnectionCreationScripts) {
            const { name, file_location: fileLocation, version } = script;

            const logCtx = await createLogCtx(script.id, script.name);

            const res = await getOrchestrator().triggerOnEventScript({
                accountId: account.id,
                connection: createdConnection.connection,
                version,
                name,
                fileLocation,
                sdkVersion: script.sdk_version,
                async: true,
                maxConcurrency: envs.ON_EVENT_ENVIRONMENT_MAX_CONCURRENCY,
                logCtx
            });

            if (res.isErr()) {
                await logCtx.failed();
            }
        }
    }

    for (const { config, currentVersion } of functions.value) {
        const logCtx = await createLogCtx(currentVersion.id, config.name);
        const res = await getOrchestrator().invokeFunction({
            environment,
            connection,
            functionConfigId: config.id,
            functionName: config.name,
            trigger: {
                kind: 'event',
                input: { event },
                connection: { connectionId: connection.connection_id, integrationId: connection.provider_config_key }
            },
            async: true,
            retryMax: 0,
            maxConcurrency: getFunctionMaxConcurrency(currentVersion),
            logCtx
        });
        if (res.isErr()) {
            await logCtx.failed();
        }
    }
}
