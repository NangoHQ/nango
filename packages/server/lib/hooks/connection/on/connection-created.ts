import type { RecentlyCreatedConnection } from '@nangohq/shared';
import { onEventScriptService } from '@nangohq/shared';
import type { LogContextGetter } from '@nangohq/logs';
import { defaultOperationExpiration } from '@nangohq/logs';
import { getOrchestrator } from '../../../utils/utils.js';

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

    const postConnectionCreationScripts = await onEventScriptService.getByConfig(config_id, event);

    if (postConnectionCreationScripts.length === 0) {
        return;
    }

    for (const script of postConnectionCreationScripts) {
        const { name, file_location: fileLocation, version } = script;

        const logCtx = await logContextGetter.create(
            { operation: { type: 'events', action: 'post_connection_creation' }, expiresAt: defaultOperationExpiration.action() },
            {
                account,
                environment,
                integration: { id: config_id, name: connection.provider_config_key, provider: provider },
                connection: { id: connection.id, name: connection.connection_id },
                syncConfig: { id: script.id, name: script.name },
                meta: { event }
            }
        );
        const res = await getOrchestrator().triggerOnEventScript({
            connection: createdConnection.connection,
            version,
            name,
            fileLocation,
            logCtx
        });
        if (res.isErr()) {
            await logCtx.failed();
        }
    }
}
