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
    ConnectionConfig
} from '@nangohq/types';
import tracer from 'dd-trace';

type VerificationScriptHandler = (internalNango: InternalNango) => Promise<void>;

type VerificationScriptHandlersMap = Record<string, VerificationScriptHandler>;

const handlers: VerificationScriptHandlersMap = verificationscriptHandlers as unknown as VerificationScriptHandlersMap;

export interface InternalNango {
    getConnection: () => DBConnectionDecrypted;
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
        metadata: null,
        credentials_expires_at: null,
        last_refresh_failure: null,
        last_refresh_success: null,
        refresh_attempts: null,
        refresh_exhausted: false
    };

    const activeSpan = tracer.scope().active();

    const span = tracer.startSpan('nango.server.hooks.verificationScript', {
        childOf: activeSpan as Span,
        tags: {
            provider: providerName,
            providerConfigKey: providerConfigKey,
            connectionId: connectionId
        }
    });

    const internalConfig: InternalProxyConfiguration = { providerName };
    const externalConfig: UserProvidedProxyConfiguration = {
        endpoint: '',
        providerConfigKey,
        method: 'GET',
        data: {}
    };

    try {
        const provider = getProvider(providerName);
        if (!provider || !provider?.credentials_verification_script) {
            return;
        }

        const handler = handlers[provider.credentials_verification_script];
        if (!handler) {
            return;
        }

        const internalNango: InternalNango = {
            getConnection: () => connection,
            proxy: async (requestConfig) => {
                const proxyConfig = getProxyConfiguration({
                    externalConfig: { ...externalConfig, ...requestConfig },
                    internalConfig
                }).unwrap();

                const proxy = new ProxyRequest({
                    logger: () => {
                        // TODO: log something here?
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
    } catch (err) {
        span.setTag('error', err);
        throw err;
    } finally {
        span.finish();
    }
}

export default execute;
