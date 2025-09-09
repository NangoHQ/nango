import { defaultOperationExpiration } from '@nangohq/logs';
import { configService, getProvider, onEventScriptService } from '@nangohq/shared';

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
    const preConnectionDeletionScripts = await onEventScriptService.getByConfig(connection.config_id, event);

    if (preConnectionDeletionScripts.length === 0) {
        return;
    }

    for (const script of preConnectionDeletionScripts) {
        const { name, file_location: fileLocation, version } = script;

        const logCtx = await logContextGetter.create(
            { operation: { type: 'events', action: 'pre_connection_deletion' }, expiresAt: defaultOperationExpiration.action() },
            {
                account: team,
                environment: environment,
                integration: { id: connection.config_id, name: connection.provider_config_key, provider: integration?.provider || 'unknown' },
                connection: { id: connection.id, name: connection.connection_id },
                syncConfig: { id: script.id, name: script.name },
                meta: { event }
            }
        );

        const res = await getOrchestrator().triggerOnEventScript({
            accountId: team.id,
            connection,
            version,
            name,
            fileLocation,
            sdkVersion: script.sdk_version,
            async: false,
            logCtx
        });
        if (res.isErr()) {
            await logCtx.failed();
        }
    }
}
