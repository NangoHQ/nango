import type { AxiosError, AxiosResponse } from 'axios';
import type { RecentlyCreatedConnection, Connection, ConnectionConfig, UserProvidedProxyConfiguration } from '@nangohq/shared';
import { LogActionEnum, LogTypes, proxyService, connectionService, telemetry, getProvider } from '@nangohq/shared';
import * as postConnectionHandlers from './index.js';
import type { LogContext, LogContextGetter } from '@nangohq/logs';
import { stringifyError } from '@nangohq/utils';
import type { InternalProxyConfiguration } from '@nangohq/types';

type PostConnectionHandler = (internalNango: InternalNango) => Promise<void>;

type PostConnectionHandlersMap = Record<string, PostConnectionHandler>;

const handlers: PostConnectionHandlersMap = postConnectionHandlers as unknown as PostConnectionHandlersMap;

export interface InternalNango {
    getConnection: () => Promise<Connection>;
    proxy: <T = any>({ method, endpoint, data }: UserProvidedProxyConfiguration) => Promise<AxiosResponse<T> | AxiosError>;
    updateConnectionConfig: (config: ConnectionConfig) => Promise<ConnectionConfig>;
}

async function execute(createdConnection: RecentlyCreatedConnection, providerName: string, logContextGetter: LogContextGetter) {
    const { connection: upsertedConnection, environment, account } = createdConnection;
    let logCtx: LogContext | undefined;
    try {
        const connectionRes = await connectionService.getConnection(upsertedConnection.connection_id, upsertedConnection.provider_config_key, environment.id);
        if (connectionRes.error || !connectionRes.response) {
            return;
        }

        const connection = connectionRes.response;

        const internalConfig: InternalProxyConfiguration = {
            connection,
            providerName
        };

        const externalConfig: UserProvidedProxyConfiguration = {
            endpoint: '',
            connectionId: connection.connection_id,
            providerConfigKey: connection.provider_config_key,
            method: 'GET',
            data: {}
        };

        const internalNango: InternalNango = {
            getConnection: async () => {
                const { response: connection } = await connectionService.getConnection(
                    upsertedConnection.connection_id,
                    upsertedConnection.provider_config_key,
                    environment.id
                );

                return connection as Connection;
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

                const { response } = await proxyService.route(finalExternalConfig, internalConfig);

                if (response instanceof Error) {
                    throw response;
                }
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

        if (handler) {
            logCtx = await logContextGetter.create(
                { operation: { type: 'auth', action: 'post_connection' } },
                {
                    account,
                    environment,
                    integration: { id: upsertedConnection.config_id!, name: upsertedConnection.provider_config_key, provider: providerName },
                    connection: { id: upsertedConnection.id!, name: upsertedConnection.connection_id }
                }
            );

            try {
                await handler(internalNango);
                await logCtx.info('Success');
                await logCtx.success();
            } catch (err) {
                const errorDetails =
                    err instanceof Error
                        ? {
                              message: err.message || 'Unknown error',
                              name: err.name || 'Error',
                              stack: err.stack || 'No stack trace'
                          }
                        : 'Unknown error';

                const errorString = JSON.stringify(errorDetails);

                await logCtx.error('Post connection script failed', { error: err });
                await logCtx.failed();

                await telemetry.log(LogTypes.POST_CONNECTION_FAILURE, `Post connection script failed, ${errorString}`, LogActionEnum.AUTH, {
                    environmentId: String(environment.id),
                    connectionId: upsertedConnection.connection_id,
                    providerConfigKey: upsertedConnection.provider_config_key,
                    provider: providerName,
                    level: 'error'
                });
            }
        }
    } catch (err) {
        await telemetry.log(LogTypes.POST_CONNECTION_FAILURE, `Post connection manager failed, ${stringifyError(err)}`, LogActionEnum.AUTH, {
            environmentId: String(environment.id),
            connectionId: upsertedConnection.connection_id,
            providerConfigKey: upsertedConnection.provider_config_key,
            provider: providerName,
            level: 'error'
        });

        await logCtx?.error('Post connection script failed', { error: err });
        await logCtx?.failed();
    }
}

export default execute;
