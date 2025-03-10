import type { AxiosError, AxiosResponse } from 'axios';
import { connectionService, getProvider, ProxyRequest, getProxyConfiguration } from '@nangohq/shared';
import * as preDeleteConnectionHandlers from './pre-delete/index.js';
import type { LogContext, LogContextGetter } from '@nangohq/logs';
import { metrics } from '@nangohq/utils';
import type {
    ConnectionForProxy,
    DBConnection,
    DBConnectionDecrypted,
    InternalProxyConfiguration,
    UserProvidedProxyConfiguration
} from '@nangohq/types';

type PreConnectionDeleteHandler = (internalNango: InternalNango) => Promise<void>;

type PreConnectionDeleteHandlersMap = Record<string, PreConnectionDeleteHandler>;

const handlers: PreConnectionDeleteHandlersMap = preDeleteConnectionHandlers as unknown as PreConnectionDeleteHandlersMap;

export interface InternalNango {
    getConnection: () => Promise<DBConnection | DBConnectionDecrypted>;
    proxy: <T = any>({ method, endpoint, data }: UserProvidedProxyConfiguration) => Promise<AxiosResponse<T> | AxiosError>;
}

async function execute(connection: DBConnection | DBConnectionDecrypted, account: providerName: string, logContextGetter: LogContextGetter) {
    let logCtx: LogContext | undefined;
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
                        return connection as ConnectionForProxy;
                    }
                });
                const response = (await proxy.request()).unwrap();

                return response;
            }
        };

        const provider = getProvider(providerName);
        if (!provider || !provider['pre_connection_delete_script']) {
            return;
        }

        const preConnectionDeleteScript = provider['pre_connection_delete_script'];
        const handler = handlers[preConnectionDeleteScript];

        if (!handler) {
            return;
        }

        logCtx = await logContextGetter.create(
            { operation: { type: 'auth', action: 'pre_connection_delete' } },
            {
                account,
                environment,
                integration: { id: preDeletedConnection.config_id, name: preDeletedConnection.provider_config_key, provider: providerName },
                connection: { id: preDeletedConnection.id, name: preDeletedConnection.connection_id }
            }
        );

        try {
            await handler(internalNango);
            await logCtx.info('Success');
            await logCtx.success();
            metrics.increment(metrics.Types.PRE_CONNECTION_DELETE_SUCCESS);
        } catch (err) {
            await logCtx.error('Pre connection delete script failed', { error: err });
            await logCtx.failed();

            metrics.increment(metrics.Types.PRE_CONNECTION_DELETE_FAILURE);
        }
    } catch (err) {
        metrics.increment(metrics.Types.PRE_CONNECTION_DELETE_FAILURE);

        await logCtx?.error('Pre connection delete script failed', { error: err });
        await logCtx?.failed();
    }
}

export default execute;
