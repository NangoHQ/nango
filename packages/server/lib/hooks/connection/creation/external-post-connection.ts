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

    if (!postConnectionScripts || postConnectionScripts.length === 0) {
        return;
    }

    const logCtx = await logContextGetter.create(
        { operation: { type: 'auth', action: 'post_connection' } },
        {
            account,
            environment,
            integration: { id: config_id, name: connection.provider_config_key, provider },
            connection: { id: connection.id, name: connection.connection_id }
        }
    );

    let failed = false;
    for (const postConnectionScript of postConnectionScripts) {
        const { name, file_location: fileLocation, version } = postConnectionScript;

        const res = await getOrchestrator().triggerPostConnectionScript({
            connection: createdConnection.connection,
            version,
            name,
            fileLocation,
            logCtx
        });
        if (res.isErr()) {
            failed = true;
        }
    }

    if (failed) {
        await logCtx.failed();
    } else {
        await logCtx.success();
    }
}
