import type { AxiosError, AxiosResponse } from 'axios';
import { connectionService, ProxyRequest, getProxyConfiguration } from '@nangohq/shared';
import type { LogContextGetter } from '@nangohq/logs';
import { metrics } from '@nangohq/utils';
import type { ConnectionConfig, DBConnectionDecrypted, InternalProxyConfiguration, UserProvidedProxyConfiguration, Provider } from '@nangohq/types';

export interface InternalNango {
    getConnection: () => Promise<DBConnectionDecrypted>;
    proxy: <T = any>({ method, endpoint, data, headers, params, baseUrlOverride }: UserProvidedProxyConfiguration) => Promise<AxiosResponse<T> | AxiosError>;
    updateConnectionConfig: (config: ConnectionConfig) => Promise<ConnectionConfig>;
}

export function createInternalNangoInstance(connection: DBConnectionDecrypted, providerName: string): InternalNango {
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

export async function executeHookScriptLogic<
    P extends Provider & { [key: string]: string | undefined; provider_name?: string }, // Ensure provider_name can exist
    H extends Record<string, (internalNango: InternalNango) => Promise<void>>
>({
    internalNango,
    provider,
    providerScriptPropertyName,
    handlersMap,
    logContextGetter,
    logContextBasePayload,
    logContextEntityPayload,
    metricsSuccessType,
    scriptTypeDescription
}: {
    internalNango: InternalNango;
    provider: P | undefined;
    providerScriptPropertyName: keyof P & string;
    handlersMap: H;
    logContextGetter: LogContextGetter;
    logContextBasePayload: Parameters<LogContextGetter['create']>[0];
    logContextEntityPayload: Parameters<LogContextGetter['create']>[1];
    metricsSuccessType: metrics.Types;
    scriptTypeDescription: string;
}) {
    if (!provider || !provider[providerScriptPropertyName]) {
        return;
    }

    const scriptName = provider[providerScriptPropertyName];
    const handler = handlersMap[scriptName];

    if (!handler) {
        console.warn(
            `No handler found for ${scriptTypeDescription} script: '${scriptName}' for provider '${provider['provider_name'] || 'unknown'}'. Check script name and handler registration.`
        );
        return;
    }

    const logCtx = await logContextGetter.create(logContextBasePayload, logContextEntityPayload);

    try {
        await handler(internalNango);
        void logCtx.info('Success');
        await logCtx.success();
        metrics.increment(metricsSuccessType);
    } catch (err) {
        void logCtx.error(`${scriptTypeDescription} script failed`, { error: err });
        await logCtx.failed();
        throw err;
    }
}
