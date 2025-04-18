import { configService, onEventScriptService } from '@nangohq/shared';
import type { LogContextGetter } from '@nangohq/logs';
import { defaultOperationExpiration } from '@nangohq/logs';
import { getOrchestrator } from '../../../utils/utils.js';
import type { DBTeam, DBEnvironment, DBConnection, DBConnectionDecrypted } from '@nangohq/types';

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

    const event = 'pre-connection-deletion';
    const preConnectionDeletionScripts = await onEventScriptService.getByConfig(connection.config_id, event);

    if (preConnectionDeletionScripts.length === 0) {
        return;
    }

    const integration = await configService.getProviderConfig(connection.provider_config_key, environment.id);

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
            async: false,
            logCtx
        });
        if (res.isErr()) {
            await logCtx.failed();
        }
    }
}
