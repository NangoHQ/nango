import { connectionService, getProvider } from '@nangohq/shared';
import * as postConnectionHandlers from './index.js';
import type { LogContextGetter, LogContextOrigin } from '@nangohq/logs';
import { metrics } from '@nangohq/utils';
import type { RecentlyCreatedConnection, Provider } from '@nangohq/types';
import type { InternalNango } from './internal-nango.js';
import { getInternalNango, executeHookScriptLogic, getHandler } from './internal-nango.js';

type PostConnectionHandler = (internalNango: InternalNango) => Promise<void>;
type PostConnectionHandlersMap = Record<string, PostConnectionHandler>;
const handlers: PostConnectionHandlersMap = postConnectionHandlers as unknown as PostConnectionHandlersMap;

async function execute(createdConnection: RecentlyCreatedConnection, providerName: string, logContextGetter: LogContextGetter) {
    const { connection: upsertedConnection, environment, account } = createdConnection;

    let logCtx: LogContextOrigin | undefined;

    try {
        const connectionRes = await connectionService.getConnection(upsertedConnection.connection_id, upsertedConnection.provider_config_key, environment.id);
        if (connectionRes.error || !connectionRes.response) {
            return;
        }
        const connection = connectionRes.response;

        const internalNango = getInternalNango(connection, providerName);
        const providerInstance = getProvider(providerName);

        // Define the expected Provider type for this specific hook
        type PostConnectionProvider = Provider & { post_connection_script?: string; provider_name?: string; [key: string]: string | undefined };

        const scriptTypeDescription = 'Post-connection';
        const handler = getHandler<PostConnectionProvider, PostConnectionHandlersMap>(
            providerInstance as PostConnectionProvider,
            'post_connection_script',
            handlers,
            scriptTypeDescription
        );

        if (handler) {
            const getLogContext = () => {
                const logContextBasePayload = { operation: { type: 'auth', action: 'post_connection' } } as const;
                const logContextEntityPayload = {
                    account,
                    environment,
                    integration: { id: upsertedConnection.config_id, name: upsertedConnection.provider_config_key, provider: providerName },
                    connection: { id: upsertedConnection.id, name: upsertedConnection.connection_id }
                };
                return logContextGetter.create(logContextBasePayload, logContextEntityPayload);
            };
            await executeHookScriptLogic({
                internalNango,
                handler,
                getLogContext,
                metricsSuccessType: metrics.Types.POST_CONNECTION_SUCCESS,
                scriptTypeDescription
            });
        }
    } catch (err) {
        metrics.increment(metrics.Types.POST_CONNECTION_FAILURE);
        void logCtx?.error('Post-connection script failed', { error: err });
        await logCtx?.failed();
    }
}

export default execute;
