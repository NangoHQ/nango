import type { AxiosError, AxiosResponse } from 'axios';
import { connectionService, getProvider, ProxyRequest, getProxyConfiguration } from '@nangohq/shared';
import * as preConnectionHandlers from './index.js';
import type { LogContextGetter, LogContextOrigin } from '@nangohq/logs';
import { metrics } from '@nangohq/utils';
import type { ConnectionConfig, DBConnectionDecrypted, InternalProxyConfiguration, UserProvidedProxyConfiguration, Provider } from '@nangohq/types';

type PreConnectionHandler = (internalNango: InternalNango) => Promise<void>;

type PreConnectionHandlersMap = Record<string, PreConnectionHandler>;

const handlers: PreConnectionHandlersMap = preConnectionHandlers as unknown as PreConnectionHandlersMap;

export interface InternalNango {
    getConnection: () => Promise<DBConnectionDecrypted>;
    proxy: <T = any>({ method, endpoint, data }: UserProvidedProxyConfiguration) => Promise<AxiosResponse<T> | AxiosError>;
    updateConnectionConfig: (config: ConnectionConfig) => Promise<ConnectionConfig>;
}

async function execute({
    connection,
    environment,
    team,
    providerName,
    logContextGetter
}: {
    connection: DBConnectionDecrypted;
    environment: any;
    team: any;
    providerName: string;
    logContextGetter: LogContextGetter;
}) {
    let logCtx: LogContextOrigin | undefined;
    try {
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

        const provider = getProvider(providerName) as Provider & { pre_connection_deletion_script?: string };
        if (!provider || !provider.pre_connection_deletion_script) {
            return;
        }

        const preConnectionDeletionScript = provider.pre_connection_deletion_script;
        const handler = handlers[preConnectionDeletionScript];

        if (!handler) {
            return;
        }

        logCtx = await logContextGetter.create(
            { operation: { type: 'events', action: 'pre_connection_deletion' } },
            {
                account: team,
                environment,
                integration: { id: connection.config_id, name: connection.provider_config_key, provider: providerName },
                connection: { id: connection.id, name: connection.connection_id }
            }
        );

        try {
            await handler(internalNango);
            void logCtx.info('Success');
            await logCtx.success();
            metrics.increment(metrics.Types.PRE_CONNECTION_DELETION_SUCCESS);
        } catch (err) {
            void logCtx.error('Pre connection deletion script failed', { error: err });
            await logCtx.failed();

            metrics.increment(metrics.Types.PRE_CONNECTION_DELETION_FAILURE);
        }
    } catch (err) {
        metrics.increment(metrics.Types.PRE_CONNECTION_DELETION_FAILURE);

        void logCtx?.error('Pre connection deletion script failed', { error: err });
        await logCtx?.failed();
    }
}

export default execute;
