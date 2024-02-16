import type { AxiosError, AxiosResponse } from 'axios';
import type { RecentlyCreatedConnection, Connection, ConnectionConfig } from '../../../models/Connection.js';
import { LogLevel, LogActionEnum } from '../../../models/Activity.js';
import { createActivityLogAndLogMessage } from '../../../services/activity/activity.service.js';
import type { HTTP_VERB } from '../../../models/Generic.js';
import type { UserProvidedProxyConfiguration } from '../../../models/Proxy.js';
import proxyService from '../../../services/proxy.service.js';
import connectionService from '../../../services/connection.service.js';
import environmentService from '../../../services/environment.service.js';
import telemetry, { LogTypes } from '../../../utils/telemetry.js';

import * as postConnectionHandlers from './index.js';

type PostConnectionHandler = (internalNango: InternalNango) => Promise<void>;

type PostConnectionHandlersMap = Record<string, PostConnectionHandler>;

const handlers: PostConnectionHandlersMap = postConnectionHandlers as unknown as PostConnectionHandlersMap;

export interface InternalNango {
    getConnection: () => Promise<Connection>;
    proxy: ({ method, endpoint, data }: UserProvidedProxyConfiguration) => Promise<AxiosResponse | AxiosError>;
    updateConnectionConfig: (config: ConnectionConfig) => Promise<ConnectionConfig>;
}

async function execute(createdConnection: RecentlyCreatedConnection, provider: string) {
    const { connection_id, environment_id, provider_config_key } = createdConnection;
    try {
        const accountId = await environmentService.getAccountIdFromEnvironment(environment_id);
        const { success, response: connection } = await connectionService.getConnectionCredentials(
            accountId as number,
            environment_id,
            connection_id,
            provider_config_key
        );

        if (!success || !connection) {
            return;
        }

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
                const { response: connection } = await connectionService.getConnection(connection_id, provider_config_key, environment_id);

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
            } catch (e: any) {
                const errorMessage = e.message || 'Unknown error';
                const errorDetails = {
                    message: errorMessage,
                    name: e.name || 'Error',
                    stack: e.stack || 'No stack trace'
                };

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
                    environment_id
                };

                await createActivityLogAndLogMessage(log, {
                    level: 'error',
                    environment_id: environment_id,
                    timestamp: Date.now(),
                    content: `Post connection script failed with the error: ${errorString}`
                });

                await telemetry.log(LogTypes.POST_CONNECTION_SCRIPT_FAILURE, `Post connection script failed, ${errorString}`, LogActionEnum.AUTH, {
                    environmentId: String(environment_id),
                    connectionId: connection_id,
                    providerConfigKey: provider_config_key,
                    provider: provider
                });
            }
        }
    } catch (e: any) {
        const errorMessage = e.message || 'Unknown error';
        const errorDetails = {
            message: errorMessage,
            name: e.name || 'Error',
            stack: e.stack || 'No stack trace'
        };

        const errorString = JSON.stringify(errorDetails);

        await telemetry.log(LogTypes.POST_CONNECTION_SCRIPT_FAILURE, `Post connection manager failed, ${errorString}`, LogActionEnum.AUTH, {
            environmentId: String(environment_id),
            connectionId: connection_id,
            providerConfigKey: provider_config_key,
            provider: provider
        });
    }
}

export default execute;
