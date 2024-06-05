import type { RecentlyCreatedConnection } from '@nangohq/shared';
import { postConnectionScriptService } from '@nangohq/shared';
import type { LogContextGetter } from '@nangohq/logs';
import { getOrchestrator } from '../../utils/utils.js';

export async function externalPostConnection(
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

    const postConnectionScripts = await postConnectionScriptService.getByConfig(config_id);

    if (!postConnectionScripts) {
        return;
    }

    const logCtx = await logContextGetter.create(
        { operation: { type: 'post-connection-script' }, message: 'Start action' },
        {
            account,
            environment,
            integration: { id: config_id, name: connection.provider_config_key, provider },
            connection: { id: connection.id, name: connection.connection_id }
        }
    );

    for (const postConnectionScript of postConnectionScripts) {
        const { name, file_location: fileLocation } = postConnectionScript;

        await getOrchestrator().triggerPostConnectionScript({
            connection: createdConnection.connection,
            name,
            fileLocation,
            logCtx
        });
    }
}
