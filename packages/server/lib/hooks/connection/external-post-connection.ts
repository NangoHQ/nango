import type { LogLevel, RecentlyCreatedConnection } from '@nangohq/shared';
import { createActivityLog, LogActionEnum, postConnectionScriptService } from '@nangohq/shared';
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

    const log = {
        level: 'info' as LogLevel,
        success: false,
        action: LogActionEnum.POST_CONNECTION_SCRIPT,
        start: Date.now(),
        end: Date.now(),
        timestamp: Date.now(),
        connection_id: connection.connection_id,
        provider,
        provider_config_key: connection.provider_config_key,
        environment_id: environment.id,
        operation_name: 'post-connection-script'
    };

    const activityLogId = await createActivityLog(log);

    const logCtx = await logContextGetter.create(
        { id: String(activityLogId), operation: { type: 'post-connection-script' }, message: 'Start action' },
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
            activityLogId: activityLogId as number,
            logCtx
        });
    }
}
