import { connectionService, getProvider } from '@nangohq/shared';
import { metrics } from '@nangohq/utils';

import * as postConnectionHandlers from './index.js';
import { getHandler, getInternalNango } from './internal-nango.js';

import type { InternalNango } from './internal-nango.js';
import type { LogContextGetter, LogContextOrigin } from '@nangohq/logs';
import type { RecentlyCreatedConnection } from '@nangohq/types';

type PostConnectionHandler = (internalNango: InternalNango) => Promise<void>;
type PostConnectionHandlersMap = Record<string, PostConnectionHandler>;
const handlers: PostConnectionHandlersMap = postConnectionHandlers as unknown as PostConnectionHandlersMap;

async function execute(createdConnection: RecentlyCreatedConnection, providerName: string, logContextGetter: LogContextGetter) {
    const { connection: upsertedConnection, environment, account } = createdConnection;

    let logCtx: LogContextOrigin | undefined = undefined;

    try {
        const connectionRes = await connectionService.getConnection(upsertedConnection.connection_id, upsertedConnection.provider_config_key, environment.id);
        if (connectionRes.error || !connectionRes.response) {
            return;
        }
        const connection = connectionRes.response;

        const internalNango = getInternalNango(connection, providerName);
        const provider = getProvider(providerName);

        const handler = getHandler({
            provider: provider,
            providerScriptPropertyName: 'post_connection_script',
            handlers
        });

        if (handler) {
            logCtx = await logContextGetter.create(
                { operation: { type: 'auth', action: 'post_connection' } },
                {
                    account,
                    environment,
                    integration: { id: upsertedConnection.config_id, name: upsertedConnection.provider_config_key, provider: providerName },
                    connection: { id: upsertedConnection.id, name: upsertedConnection.connection_id }
                }
            );
            await handler(internalNango);
            void logCtx.info(`post-connection-creation script succeeded`);
            await logCtx.success();
            metrics.increment(metrics.Types.POST_CONNECTION_SUCCESS, 1, { provider: providerName });
        }
    } catch (err) {
        metrics.increment(metrics.Types.POST_CONNECTION_FAILURE, 1, { provider: providerName });
        void logCtx?.error('Post-connection script failed', { error: err });
        await logCtx?.failed();
    }
}

export default execute;
