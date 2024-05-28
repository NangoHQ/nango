import type { AxiosError, AxiosResponse } from 'axios';
import type { RecentlyCreatedConnection, Connection, ConnectionConfig, LogLevel, HTTP_VERB, UserProvidedProxyConfiguration } from '@nangohq/shared';
import { LogActionEnum, LogTypes, createActivityLogAndLogMessage, proxyService, connectionService, telemetry } from '@nangohq/shared';
import * as postConnectionHandlers from './index.js';
import type { LogContextGetter } from '@nangohq/logs';
import { stringifyError } from '@nangohq/utils';

type PostConnectionHandler = (internalNango: InternalNango) => Promise<void>;

type PostConnectionHandlersMap = Record<string, PostConnectionHandler>;

const handlers: PostConnectionHandlersMap = postConnectionHandlers as unknown as PostConnectionHandlersMap;

export interface InternalNango {
    getConnection: () => Promise<Connection>;
    proxy: ({ method, endpoint, data }: UserProvidedProxyConfiguration) => Promise<AxiosResponse | AxiosError>;
    updateConnectionConfig: (config: ConnectionConfig) => Promise<ConnectionConfig>;
}

async function execute(createdConnection: RecentlyCreatedConnection, provider: string, logContextGetter: LogContextGetter) {
    const { connection_id, environment, account, provider_config_key } = createdConnection;
    try {
        const credentialResponse = await connectionService.getConnectionCredentials({
            account,
            environment,
            connectionId: connection_id,
            providerConfigKey: provider_config_key,
            logContextGetter,
            instantRefresh: false
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
                const { response: connection } = await connectionService.getConnection(connection_id, provider_config_key, environment.id);

                return connection as Connection;
            },
            proxy: async ({ method, endpoint, data }: UserProvidedProxyConfiguration) => {
                const finalExternalConfig = { ...externalConfig, method: method || externalConfig.method, endpoint };
                if (data) {
                    finalExternalConfig.data = data;
                }
                const { response } = await proxyService.route(finalExternalConfig, internalConfig);
                return response;
            },
            updateConnectionConfig: (connectionConfig: ConnectionConfig) => {
                return connectionService.updateConnectionConfig(connection as unknown as Connection, connectionConfig);
            }
        };

        const handler = handlers[`${provider.replace(/-/g, '')}PostConnection`];

        if (handler) {
            try {
                await handler(internalNango);
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
                const log = {
                    level: 'error' as LogLevel,
                    success: false,
                    action: LogActionEnum.AUTH,
                    start: Date.now(),
                    end: Date.now(),
                    timestamp: Date.now(),
                    connection_id: connection_id,
                    provider,
                    provider_config_key: provider_config_key,
                    environment_id: environment.id
                };

                const activityLogId = await createActivityLogAndLogMessage(log, {
                    level: 'error',
                    environment_id: environment.id,
                    timestamp: Date.now(),
                    content: `Post connection script failed with the error: ${errorString}`
                });
                const logCtx = await logContextGetter.create(
                    { id: String(activityLogId), operation: { type: 'auth', action: 'post_connection' }, message: 'Authentication' },
                    {
                        account,
                        environment,
                        integration: { id: connection.config_id!, name: connection.provider_config_key, provider },
                        connection: { id: connection.id!, name: connection.connection_id }
                    }
                );
                await logCtx.error('Post connection script failed', { error: e });
                await logCtx.failed();

                await telemetry.log(LogTypes.POST_CONNECTION_SCRIPT_FAILURE, `Post connection script failed, ${errorString}`, LogActionEnum.AUTH, {
                    environmentId: String(environment.id),
                    connectionId: connection_id,
                    providerConfigKey: provider_config_key,
                    provider: provider,
                    level: 'error'
                });
            }
        }
    } catch (err) {
        await telemetry.log(LogTypes.POST_CONNECTION_SCRIPT_FAILURE, `Post connection manager failed, ${stringifyError(err)}`, LogActionEnum.AUTH, {
            environmentId: String(environment.id),
            connectionId: connection_id,
            providerConfigKey: provider_config_key,
            provider: provider,
            level: 'error'
        });
    }
}

export default execute;
