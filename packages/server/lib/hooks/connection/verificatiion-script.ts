import type { Span } from 'dd-trace';
import type { AxiosError, AxiosResponse } from 'axios';
import type { Config } from '@nangohq/shared';
import { getProvider, ProxyRequest, getProxyConfiguration } from '@nangohq/shared';
import * as verificationscriptHandlers from './index.js';
import type {
    InternalProxyConfiguration,
    ApiKeyCredentials,
    BasicApiCredentials,
    TbaCredentials,
    JwtCredentials,
    SignatureCredentials,
    UserProvidedProxyConfiguration,
    DBConnectionDecrypted,
    ConnectionConfig,
    MessageRowInsert
} from '@nangohq/types';
import tracer from 'dd-trace';
import { stringifyError } from '@nangohq/utils';

type VerificationScriptHandler = (internalNango: InternalNango) => Promise<void>;

type VerificationScriptHandlersMap = Record<string, VerificationScriptHandler>;

const handlers: VerificationScriptHandlersMap = verificationscriptHandlers as unknown as VerificationScriptHandlersMap;

export interface InternalNango {
    getCredentials: () => Promise<{
        credentials: ApiKeyCredentials | BasicApiCredentials | TbaCredentials | JwtCredentials | SignatureCredentials;
        providerConfigKey: string;
    }>;
    proxy: <T = any>({ method, endpoint, data, headers, params, baseUrlOverride }: UserProvidedProxyConfiguration) => Promise<AxiosResponse<T> | AxiosError>;
}

async function execute(
    config: Config,
    credentials: ApiKeyCredentials | BasicApiCredentials | TbaCredentials | JwtCredentials | SignatureCredentials,
    connectionId: string,
    connectionConfig: ConnectionConfig
) {
    const { provider: providerName, unique_key: providerConfigKey } = config;

    const connection: DBConnectionDecrypted = {
        id: -1,
        end_user_id: null,
        provider_config_key: config.unique_key,
        connection_id: connectionId,
        credentials,
        connection_config: connectionConfig,
        environment_id: config.environment_id,
        created_at: new Date(),
        updated_at: new Date(),
        config_id: -1,
        credentials_iv: null,
        credentials_tag: null,
        deleted: false,
        deleted_at: null,
        last_fetched_at: null,
        metadata: null
    };

    const activeSpan = tracer.scope().active();

    const span = tracer.startSpan('nango.server.hooks.verificationScript', {
        childOf: activeSpan as Span,
        tags: {
            'nango.provider': providerName,
            'nango.providerConfigKey': providerConfigKey,
            'nango.connectionId': connectionId
        }
    });

    const internalConfig: InternalProxyConfiguration = { providerName };
    const externalConfig: UserProvidedProxyConfiguration = {
        endpoint: '',
        providerConfigKey,
        method: 'GET',
        data: {}
    };

    const logs: MessageRowInsert[] = [
        {
            type: 'log',
            level: 'info',
            message: 'Running automatic credentials verification via verification script',
            createdAt: new Date().toISOString()
        }
    ];

    try {
        const provider = getProvider(providerName);
        if (!provider || !provider?.verification_script) {
            return;
        }

        const handler = handlers[provider.verification_script];
        if (!handler) {
            return;
        }

        const internalNango: InternalNango = {
            getCredentials: async () =>
                Promise.resolve({
                    credentials,
                    providerConfigKey
                }),
            proxy: async (requestConfig) => {
                const proxyConfig = getProxyConfiguration({
                    externalConfig: { ...externalConfig, ...requestConfig },
                    internalConfig
                }).unwrap();

                const proxy = new ProxyRequest({
                    logger: (msg) => {
                        logs.push(msg);
                    },
                    proxyConfig,
                    getConnection: () => {
                        return connection;
                    }
                });
                return (await proxy.request()).unwrap();
            }
        };

        await handler(internalNango);
        span.setTag('nango.success', true);
    } catch (err) {
        const errorString = stringifyError(err);
        span.setTag('nango.error', errorString);
        throw err;
    } finally {
        span.finish();
    }
}

export default execute;
