import type { ParamsSerializerOptions } from 'axios';
import type { Template as ProviderTemplate, HTTP_VERB, BasicApiCredentials, ApiKeyCredentials } from '@nangohq/shared';

export interface DBConfig {
    encryption_key_hash?: string | null;
    encryption_complete: boolean;
}

export interface ProxyBodyConfiguration {
    endpoint: string;
    provider: string;
    providerConfigKey: string;
    connectionId: string;
    token: string | BasicApiCredentials | ApiKeyCredentials;
    method: HTTP_VERB;
    template: ProviderTemplate;

    retries?: number;
    data?: unknown;
    headers?: Record<string, string>;
    params?: string | Record<string, string>;
    paramsSerializer?: ParamsSerializerOptions;
    baseUrlOverride?: string;
}
