import { connectionService, getProvider } from '@nangohq/shared';
import * as postConnectionHandlers from './index.js';
import type { LogContextGetter, LogContextOrigin } from '@nangohq/logs';
import { metrics } from '@nangohq/utils';
import type { RecentlyCreatedConnection, Provider } from '@nangohq/types';
import type { InternalNango } from './internal-nango.js';
import { createInternalNangoInstance, executeHookScriptLogic } from './internal-nango.js';

type PostConnectionHandler = (internalNango: InternalNango) => Promise<void>;
type PostConnectionHandlersMap = Record<string, PostConnectionHandler>;
const handlers: PostConnectionHandlersMap = postConnectionHandlers as unknown as PostConnectionHandlersMap;

async function execute(createdConnection: RecentlyCreatedConnection, providerName: string, logContextGetter: LogContextGetter) {
    const { connection: upsertedConnection, environment, account } = createdConnection;
    let overallLogCtx: LogContextOrigin | undefined;

    try {
        const connectionRes = await connectionService.getConnection(upsertedConnection.connection_id, upsertedConnection.provider_config_key, environment.id);
        if (connectionRes.error || !connectionRes.response) {
            metrics.increment(metrics.Types.POST_CONNECTION_FAILURE);
            try {
                overallLogCtx = await logContextGetter.create(
                    { operation: { type: 'auth', action: 'post_connection' } },
                    {
                        account,
                        environment,
                        integration: { id: upsertedConnection.config_id, name: upsertedConnection.provider_config_key, provider: providerName },
                        connection: { id: upsertedConnection.id, name: upsertedConnection.connection_id }
                    }
                );
                await overallLogCtx.error('Failed to get connection for post-connection hook', { error: connectionRes.error });
                await overallLogCtx.failed();
            } catch (logSetupErr) {
                console.error('Post-connection: Failed to get connection AND also failed to log this error', {
                    getConnError: connectionRes.error,
                    logError: logSetupErr
                });
            }
            return;
        }
        const connection = connectionRes.response;

        const internalNango = createInternalNangoInstance(connection, providerName);
        const providerInstance = getProvider(providerName);

        // Define the expected Provider type for this specific hook
        type PostConnectionProvider = Provider & { post_connection_script?: string; provider_name?: string; [key: string]: string | undefined };

        await executeHookScriptLogic<PostConnectionProvider, PostConnectionHandlersMap>({
            internalNango,
            provider: providerInstance as PostConnectionProvider,
            providerScriptPropertyName: 'post_connection_script',
            handlersMap: handlers,
            logContextGetter,
            logContextBasePayload: { operation: { type: 'auth', action: 'post_connection' } },
            logContextEntityPayload: {
                account,
                environment,
                integration: { id: upsertedConnection.config_id, name: upsertedConnection.provider_config_key, provider: providerName },
                connection: { id: upsertedConnection.id, name: upsertedConnection.connection_id }
            },
            metricsSuccessType: metrics.Types.POST_CONNECTION_SUCCESS,
            scriptTypeDescription: 'Post-connection'
        });
    } catch (err) {
        metrics.increment(metrics.Types.POST_CONNECTION_FAILURE);
        try {
            if (!overallLogCtx) {
                overallLogCtx = await logContextGetter.create(
                    { operation: { type: 'auth', action: 'post_connection' } },
                    {
                        account,
                        environment,
                        integration: { id: upsertedConnection?.config_id, name: upsertedConnection?.provider_config_key, provider: providerName },
                        connection: { id: upsertedConnection?.id, name: upsertedConnection?.connection_id }
                    }
                );
            }
            if (overallLogCtx) {
                void overallLogCtx.error('Post-connection hook execution failed', { error: err });
                await overallLogCtx.failed();
            } else {
                console.error('Post-connection hook execution failed, and log context could not be established.', { originalError: err });
            }
        } catch (logErr) {
            console.error('Outer catch: Post-connection hook failed AND also failed to create/use log context during error reporting', {
                originalError: err,
                logError: logErr
            });
        }
    }
}

export default execute;
