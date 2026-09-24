import db from '@nangohq/database';
import { defaultOperationExpiration } from '@nangohq/logs';
import { configService, functionConfigService, getFunctionMaxConcurrency, getProvider, onEventScriptService } from '@nangohq/shared';

import { envs } from '../../../env.js';
import { getOrchestrator } from '../../../utils/utils.js';
import preConnectionExecute from '../pre-connection.js';

import type { LogContextGetter } from '@nangohq/logs';
import type { DBConnection, DBConnectionDecrypted, DBEnvironment, DBTeam } from '@nangohq/types';

export async function preConnectionDeletion({
    team,
    environment,
    connection,
    logContextGetter
}: {
    team: DBTeam;
    environment: DBEnvironment;
    connection: DBConnection | DBConnectionDecrypted;
    logContextGetter: LogContextGetter;
}): Promise<void> {
    if (!connection.config_id || !connection.id) {
        return;
    }

    const integration = await configService.getProviderConfig(connection.provider_config_key, environment.id);

    // Check for provider-specific pre-connection deletion script
    if (integration?.provider) {
        const provider = getProvider(integration.provider);

        if (provider && 'pre_connection_deletion_script' in provider) {
            try {
                await preConnectionExecute({
                    connection: connection as DBConnectionDecrypted,
                    environment,
                    team,
                    providerName: integration.provider,
                    logContextGetter
                });
            } catch (err) {
                // Continue with other scripts even if provider-specific script fails
                console.error('Provider-specific pre-connection deletion script failed:', err);
            }
        }
    }

    // Run custom on-event scripts
    const event = 'pre-connection-deletion';
    const createLogCtx = async (id: number, name: string) =>
        await logContextGetter.create(
            { operation: { type: 'events', action: 'pre_connection_deletion' }, expiresAt: defaultOperationExpiration.action() },
            {
                account: team,
                environment,
                integration: { id: connection.config_id, name: connection.provider_config_key, provider: integration?.provider || 'unknown' },
                connection: { id: connection.id, name: connection.connection_id },
                syncConfig: { id, name },
                meta: { event }
            }
        );
    const functions = await functionConfigService.search(db.knex, {
        environmentId: environment.id,
        filter: { integrationKey: connection.provider_config_key, enabled: true, trigger: { kind: 'event', event } }
    });
    if (functions.isErr()) {
        throw functions.error;
    }

    const preConnectionDeletionScripts = await onEventScriptService.getByConfig(connection.config_id, event);

    for (const script of preConnectionDeletionScripts) {
        const { name, file_location: fileLocation, version } = script;

        const logCtx = await createLogCtx(script.id, script.name);

        const res = await getOrchestrator().triggerOnEventScript({
            accountId: team.id,
            connection,
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
            async: false,
            retryMax: 0,
            maxConcurrency: getFunctionMaxConcurrency(currentVersion),
            logCtx
        });
        if (res.isErr()) {
            await logCtx.failed();
        }
    }
}
