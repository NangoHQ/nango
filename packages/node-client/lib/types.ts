import type { ParamsSerializerOptions } from 'axios';

export enum AuthModes {
    OAuth1 = 'OAUTH1',
    OAuth2 = 'OAUTH2',
    Basic = 'BASIC',
    ApiKey = 'API_KEY'
}

export interface CredentialsCommon<T = Record<string, any>> {
    type: AuthModes;
    raw: T;
}

export interface OAuth1Credentials extends CredentialsCommon {
    type: AuthModes.OAuth1;
    oauth_token: string;
    oauth_token_secret: string;
}

export interface OAuth2Credentials extends CredentialsCommon {
    type: AuthModes.OAuth2;
    access_token: string;

    refresh_token?: string;
    expires_at?: Date | undefined;
}

export interface ProxyConfiguration {
    endpoint: string;
    providerConfigKey?: string;
    connectionId?: string;

    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' | 'get' | 'post' | 'patch' | 'put' | 'delete';
    headers?: Record<string, string>;
    params?: string | Record<string, string>;
    paramsSerializer?: ParamsSerializerOptions;
    data?: unknown;
    retries?: number;
    baseUrlOverride?: string;
}

export interface GetRecordsRequestConfig {
    providerConfigKey: string;
    connectionId: string;
    model: string;
    delta?: string;
    offset?: number;
    limit?: number;
}
