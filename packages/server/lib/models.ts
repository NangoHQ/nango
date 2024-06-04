import type { ParamsSerializerOptions } from 'axios';
import type { HTTP_VERB, BasicApiCredentials, ApiKeyCredentials, AppCredentials } from '@nangohq/shared';
import type { Template as ProviderTemplate } from '@nangohq/types';

export interface DBConfig {
    encryption_key_hash?: string | null;
    encryption_complete: boolean;
}

export interface ProxyBodyConfiguration {
    endpoint: string;
    provider: string;
    providerConfigKey: string;
    connectionId: string;
    token: string | BasicApiCredentials | ApiKeyCredentials | AppCredentials;
    method: HTTP_VERB;
    template: ProviderTemplate;

    retries?: number;
    data?: unknown;
    headers?: Record<string, string>;
    params?: string | Record<string, string>;
    paramsSerializer?: ParamsSerializerOptions;
    baseUrlOverride?: string;
    decompress?: boolean;
}
