import type { AxiosError, AxiosResponse } from 'axios';
import { connectionService, ProxyRequest, getProxyConfiguration } from '@nangohq/shared';
import type { ConnectionConfig, DBConnectionDecrypted, InternalProxyConfiguration, UserProvidedProxyConfiguration, Provider } from '@nangohq/types';

export interface InternalNango {
    getConnection: () => Promise<DBConnectionDecrypted>;
    proxy: <T = any>({ method, endpoint, data, headers, params, baseUrlOverride }: UserProvidedProxyConfiguration) => Promise<AxiosResponse<T> | AxiosError>;
    updateConnectionConfig: (config: ConnectionConfig) => Promise<ConnectionConfig>;
}

export function getInternalNango(connection: DBConnectionDecrypted, providerName: string): InternalNango {
    const internalConfig: InternalProxyConfiguration = {
        providerName
    };

    // Base for external config. method, endpoint, and data are set per-call in the proxy.
    const externalConfigBase: Pick<UserProvidedProxyConfiguration, 'providerConfigKey'> = {
        providerConfigKey: connection.provider_config_key
    };

    return {
        getConnection: () => Promise.resolve(connection),
        proxy: async <_T = any>({ method = 'GET', endpoint, data = {}, headers = {}, params = {}, baseUrlOverride }: UserProvidedProxyConfiguration) => {
            const finalExternalConfig: UserProvidedProxyConfiguration = {
                ...externalConfigBase,
                method,
                endpoint,
                headers,
                params,
                data,
                ...(baseUrlOverride !== undefined && { baseUrlOverride })
            };

            const proxyConfigUnwrapped = getProxyConfiguration({ externalConfig: finalExternalConfig, internalConfig }).unwrap();
            const proxyInstance = new ProxyRequest({
                logger: () => {
                    /* TODO: structured logging here if needed */
                },
                proxyConfig: proxyConfigUnwrapped,
                getConnection: () => connection
            });
            const response = (await proxyInstance.request()).unwrap();
            return response;
        },
        updateConnectionConfig: (connectionConfig: ConnectionConfig) => {
            return connectionService.updateConnectionConfig(connection, connectionConfig);
        }
    };
}

export function getHandler({
    provider,
    providerScriptPropertyName,
    handlers
}: {
    provider: Provider | null;
    providerScriptPropertyName: 'pre_connection_deletion_script' | 'post_connection_script';
    handlers: Record<string, (internalNango: InternalNango) => Promise<void>>;
}): ((internalNango: InternalNango) => Promise<void>) | undefined {
    if (!provider || !provider[providerScriptPropertyName]) {
        return undefined;
    }

    const scriptName = provider[providerScriptPropertyName];
    if (!scriptName) {
        return undefined;
    }
    const handler = handlers[scriptName];

    if (!handler) {
        console.warn(
            `No handler found for ${providerScriptPropertyName} script: '${scriptName}' for provider '${provider.display_name}'. Check script name and handler registration.`
        );
        return undefined;
    }

    return handler;
}
