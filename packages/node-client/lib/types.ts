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

export interface BasicApiCredentials {
    type?: AuthModes.Basic;
    username: string;
    password: string;
}

export interface ApiKeyCredentials {
    type?: AuthModes.ApiKey;
    apiKey: string;
}

type AuthCredentials = OAuth2Credentials | OAuth1Credentials | BasicApiCredentials | ApiKeyCredentials;

export interface Connection {
    id?: number;
    created_at?: string;
    updated_at?: string;
    provider_config_key: string;
    connection_id: string;
    connection_config: Record<string, string>;
    environment_id: number;
    metadata: Record<string, string> | null;
    credentials_iv?: string | null;
    credentials_tag?: string | null;
    field_mappings?: Record<string, string>;
    credentials: AuthCredentials;
}

export interface ConnectionList {
    id: number;
    connectionId: number;
    providerConfigKey: string;
    provider: string;
    creationDate: string;
}

export interface IntegrationWithCreds extends Integration {
    clientId: string;
    clientSecret: string;
    scopes: string;
}

export interface Integration {
    uniqueKey: string;
    provider: string;
}
