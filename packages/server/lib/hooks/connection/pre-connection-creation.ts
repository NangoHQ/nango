import { getProvider } from '@nangohq/shared';
import { metrics } from '@nangohq/utils';

import * as preConnectionHandlers from './index.js';
import { getHandler, getInternalNango } from './internal-nango.js';

import type { InternalNango } from './internal-nango.js';
import type { LogContextGetter, LogContextOrigin } from '@nangohq/logs';
import type { Config } from '@nangohq/shared';
import type { ConnectionConfig, DBConnectionDecrypted, DBEnvironment, DBTeam } from '@nangohq/types';

type PreConnectionHandler = (internalNango: InternalNango) => Promise<void>;

type PreConnectionHandlersMap = Record<string, PreConnectionHandler>;
const handlers: PreConnectionHandlersMap = preConnectionHandlers as unknown as PreConnectionHandlersMap;

async function execute(
    connectionId: string,
    connectionConfig: ConnectionConfig,
    logContextGetter: LogContextGetter,
    account: DBTeam,
    environment: DBEnvironment,
    config: Config
): Promise<ConnectionConfig | void> {
    let logCtx: LogContextOrigin | undefined = undefined;

    const { provider: providerName, unique_key: providerConfigKey } = config;
    const provider = getProvider(providerName);
    const handler = getHandler({
        provider,
        providerScriptPropertyName: 'pre_connection_creation_script',
        handlers
    });

    const connection: DBConnectionDecrypted = {
        id: -1,
        end_user_id: null,
        provider_config_key: providerConfigKey,
        connection_id: connectionId,
        credentials: {},
        connection_config: connectionConfig,
        environment_id: environment.id,
        created_at: new Date(),
        updated_at: new Date(),
        config_id: -1,
        credentials_iv: null,
        credentials_tag: null,
        deleted: false,
        deleted_at: null,
        last_fetched_at: null,
        metadata: null,
        credentials_expires_at: null,
        last_refresh_failure: null,
        last_refresh_success: null,
        refresh_attempts: null,
        refresh_exhausted: false
    };

    try {
        if (handler) {
            logCtx = await logContextGetter.create(
                { operation: { type: 'events', action: 'pre_connection_creation_script' } },
                {
                    account,
                    environment,
                    integration: { id: connection.config_id, name: connection.provider_config_key, provider: providerName },
                    connection: { id: connection.id, name: connection.connection_id }
                }
            );

            const baseInternalNango = getInternalNango(connection, providerName);

            const internalNango = {
                getConnection: baseInternalNango.getConnection,
                proxy: baseInternalNango.proxy,
                updateConnectionConfig: (config: ConnectionConfig) => Promise.resolve(config),
                unsetConnectionConfigAttributes: (...keys: string[]) => {
                    const updatedConfig = Object.fromEntries(Object.entries(connection.connection_config).filter(([key]) => !keys.includes(key)));
                    return Promise.resolve(updatedConfig);
                }
            };

            const updatedConnectionConfig = await handler(internalNango);
            void logCtx.info(`pre-connection-creation script succeeded`);
            await logCtx.success();
            metrics.increment(metrics.Types.PRE_CONNECTION__CREATION_SUCCESS);

            return updatedConnectionConfig ?? undefined;
        }

        return undefined;
    } catch (err) {
        metrics.increment(metrics.Types.PRE_CONNECTION__CREATION_FAILURE);
        void logCtx?.error('pre-connection-creation script failed', { error: err });
        await logCtx?.failed();
        throw err;
    }
}

export default execute;
