import type { AxiosError, AxiosResponse } from 'axios';
import { connectionService, getProvider, ProxyRequest, getProxyConfiguration } from '@nangohq/shared';
import * as postConnectionHandlers from './index.js';
import type { LogContextGetter, LogContextOrigin } from '@nangohq/logs';
import { metrics } from '@nangohq/utils';
import type {
    ConnectionConfig,
    DBConnectionDecrypted,
    InternalProxyConfiguration,
    RecentlyCreatedConnection,
    UserProvidedProxyConfiguration
} from '@nangohq/types';

type PostConnectionHandler = (internalNango: InternalNango) => Promise<void>;

type PostConnectionHandlersMap = Record<string, PostConnectionHandler>;

const handlers: PostConnectionHandlersMap = postConnectionHandlers as unknown as PostConnectionHandlersMap;

export interface InternalNango {
    getConnection: () => Promise<DBConnectionDecrypted>;
    proxy: <T = any>({ method, endpoint, data }: UserProvidedProxyConfiguration) => Promise<AxiosResponse<T> | AxiosError>;
    updateConnectionConfig: (config: ConnectionConfig) => Promise<ConnectionConfig>;
}

async function execute(createdConnection: RecentlyCreatedConnection, providerName: string, logContextGetter: LogContextGetter) {
    const { connection: upsertedConnection, environment, account } = createdConnection;
    let logCtx: LogContextOrigin | undefined;
    try {
        const connectionRes = await connectionService.getConnection(upsertedConnection.connection_id, upsertedConnection.provider_config_key, environment.id);
        if (connectionRes.error || !connectionRes.response) {
            return;
        }

        const connection = connectionRes.response;

        const internalConfig: InternalProxyConfiguration = {
            providerName
        };

        const externalConfig: UserProvidedProxyConfiguration = {
            endpoint: '',
            providerConfigKey: connection.provider_config_key,
            method: 'GET',
            data: {}
        };

        const internalNango: InternalNango = {
            getConnection: () => {
                return Promise.resolve(connection);
            },
            proxy: async ({ method, endpoint, data, headers, params, baseUrlOverride }: UserProvidedProxyConfiguration) => {
                const finalExternalConfig: UserProvidedProxyConfiguration = {
                    ...externalConfig,
                    method: method || externalConfig.method || 'GET',
                    endpoint,
                    headers: headers || {},
                    params: params || {}
                };

                if (baseUrlOverride) {
                    finalExternalConfig.baseUrlOverride = baseUrlOverride;
                }

                if (data) {
                    finalExternalConfig.data = data;
                }

                const proxyConfig = getProxyConfiguration({ externalConfig: finalExternalConfig, internalConfig }).unwrap();
                const proxy = new ProxyRequest({
                    logger: () => {
                        // TODO: log something here?
                    },
                    proxyConfig,
                    getConnection: () => {
                        return connection;
                    }
                });
                const response = (await proxy.request()).unwrap();

                return response;
            },
            updateConnectionConfig: (connectionConfig: ConnectionConfig) => {
                return connectionService.updateConnectionConfig(connection, connectionConfig);
            }
        };

        const provider = getProvider(providerName);
        if (!provider || !provider['post_connection_script']) {
            return;
        }

        const postConnectionScript = provider['post_connection_script'];
        const handler = handlers[postConnectionScript];

        if (!handler) {
            return;
        }

        logCtx = await logContextGetter.create(
            { operation: { type: 'auth', action: 'post_connection' } },
            {
                account,
                environment,
                integration: { id: upsertedConnection.config_id, name: upsertedConnection.provider_config_key, provider: providerName },
                connection: { id: upsertedConnection.id, name: upsertedConnection.connection_id }
            }
        );

        try {
            await handler(internalNango);
            void logCtx.info('Success');
            await logCtx.success();
            metrics.increment(metrics.Types.POST_CONNECTION_SUCCESS);
        } catch (err) {
            void logCtx.error('Post connection script failed', { error: err });
            await logCtx.failed();

            metrics.increment(metrics.Types.POST_CONNECTION_FAILURE);
        }
    } catch (err) {
        metrics.increment(metrics.Types.POST_CONNECTION_FAILURE);

        void logCtx?.error('Post connection script failed', { error: err });
        await logCtx?.failed();
    }
}

export default execute;
