import type { Template as ProviderTemplate, HTTP_VERB } from '@nangohq/shared';

export interface DBConfig {
    encryption_key_hash?: string | null;
    encryption_complete: boolean;
}

export interface ProxyBodyConfiguration {
    endpoint: string;
    provider: string;
    providerConfigKey: string;
    connectionId: string;
    token: string;
    method: HTTP_VERB;
    template: ProviderTemplate;

    retries?: number;
    data?: unknown;
    headers?: Record<string, string>;
    params?: string | Record<string, string>;
    paramsSerializer?: {
        encode?: (param: string) => string;
        serialize?: (params: Record<string, any>, options?: ParamsSerializerOptions) => void;
        indexes?: boolean;
    };
}

interface ParamsSerializerOptions {
    encode?: ParamEncoder;
    serialize?: CustomParamsSerializer;
}

interface ParamEncoder {
    (value: any, defaultEncoder: (value: any) => any): any;
}

interface CustomParamsSerializer {
    (params: Record<string, any>, options?: ParamsSerializerOptions): string;
}
