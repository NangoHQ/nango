import type { AxiosError, AxiosResponse } from 'axios';
import type { RecentlyCreatedConnection, Connection, ConnectionConfig, HTTP_VERB, UserProvidedProxyConfiguration } from '@nangohq/shared';
import { LogActionEnum, LogTypes, proxyService, connectionService, configService, telemetry } from '@nangohq/shared';
import * as postConnectionHandlers from './index.js';
import type { LogContext, LogContextGetter } from '@nangohq/logs';
import { stringifyError } from '@nangohq/utils';
import { connectionRefreshFailed as connectionRefreshFailedHook, connectionRefreshSuccess as connectionRefreshSuccessHook } from '../hooks.js';

type PostConnectionHandler = (internalNango: InternalNango) => Promise<void>;

type PostConnectionHandlersMap = Record<string, PostConnectionHandler>;

const handlers: PostConnectionHandlersMap = postConnectionHandlers as unknown as PostConnectionHandlersMap;

export interface InternalNango {
    getConnection: () => Promise<Connection>;
    proxy: ({ method, endpoint, data }: UserProvidedProxyConfiguration) => Promise<AxiosResponse | AxiosError>;
    updateConnectionConfig: (config: ConnectionConfig) => Promise<ConnectionConfig>;
}

async function execute(createdConnection: RecentlyCreatedConnection, provider: string, logContextGetter: LogContextGetter) {
    const { connection: upsertedConnection, environment, account } = createdConnection;
    let logCtx: LogContext | undefined;
    try {
        const credentialResponse = await connectionService.getConnectionCredentials({
            account,
            environment,
            connectionId: upsertedConnection.connection_id,
            providerConfigKey: upsertedConnection.provider_config_key,
            logContextGetter,
            instantRefresh: false,
            onRefreshSuccess: connectionRefreshSuccessHook,
            onRefreshFailed: connectionRefreshFailedHook
        });

        if (credentialResponse.isErr()) {
            return;
        }

        const { value: connection } = credentialResponse;

        const internalConfig = {
            connection,
            provider
        };

        const externalConfig = {
            endpoint: '',
            connectionId: connection.connection_id,
            providerConfigKey: connection.provider_config_key,
            method: 'GET' as HTTP_VERB,
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
            proxy: async ({ method, endpoint, data, headers, params }: UserProvidedProxyConfiguration) => {
                const finalExternalConfig: UserProvidedProxyConfiguration = {
                    ...externalConfig,
                    method: method || externalConfig.method,
                    endpoint,
                    headers: headers || {},
                    params: params || {}
                };
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

        const template = configService.getTemplate(provider);

        if (!template || !template['post_connection_script']) {
            return;
        }

        const postConnectionScript = template['post_connection_script'];
        const handler = handlers[postConnectionScript];

        if (handler) {
            logCtx = await logContextGetter.create(
                { operation: { type: 'auth', action: 'post_connection' }, message: 'Start internal post connection script' },
                {
                    account,
                    environment,
                    integration: { id: upsertedConnection.config_id!, name: upsertedConnection.provider_config_key, provider },
                    connection: { id: upsertedConnection.id!, name: upsertedConnection.connection_id }
                }
            );

            try {
                await handler(internalNango);
                await logCtx.info('Success');
                await logCtx.success();
            } catch (e) {
                const errorDetails =
                    e instanceof Error
                        ? {
                              message: e.message || 'Unknown error',
                              name: e.name || 'Error',
                              stack: e.stack || 'No stack trace'
                          }
                        : 'Unknown error';

                const errorString = JSON.stringify(errorDetails);

                await logCtx.error('Post connection script failed', { error: e });
                await logCtx.failed();

                await telemetry.log(LogTypes.POST_CONNECTION_SCRIPT_FAILURE, `Post connection script failed, ${errorString}`, LogActionEnum.AUTH, {
                    environmentId: String(environment.id),
                    connectionId: upsertedConnection.connection_id,
                    providerConfigKey: upsertedConnection.provider_config_key,
                    provider: provider,
                    level: 'error'
                });
            }
        }
    } catch (err) {
        await telemetry.log(LogTypes.POST_CONNECTION_SCRIPT_FAILURE, `Post connection manager failed, ${stringifyError(err)}`, LogActionEnum.AUTH, {
            environmentId: String(environment.id),
            connectionId: upsertedConnection.connection_id,
            providerConfigKey: upsertedConnection.provider_config_key,
            provider: provider,
            level: 'error'
        });

        await logCtx?.error('Post connection script failed', { error: err });
        await logCtx?.failed();
    }
}

export default execute;
