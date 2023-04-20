export interface ProxyConfiguration {
    // allows for dynamic checking of required params
    [key: string]: any;

    endpoint: string;
    providerConfigKey: string;
    connectionId: string;

    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' | 'get' | 'post' | 'patch' | 'put' | 'delete';
    headers?: Record<string, string>;
    params?: string | Record<string, string>;
    paramsSerializer?: {
        encode?: (param: string) => string;
        serialize?: (params: Record<string, any>, options?: ParamsSerializerOptions) => void;
        indexes?: boolean;
    };
    token?: string;
    data?: unknown;
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
