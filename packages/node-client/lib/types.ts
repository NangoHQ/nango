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
    decompress?: boolean;
}

type FilterAction = 'added' | 'updated' | 'deleted';
type CombinedFilterAction = `${FilterAction},${FilterAction}`;

export interface GetRecordsRequestConfig {
    providerConfigKey: string;
    connectionId: string;
    model: string;
    delta?: string;
    offset?: number;
    limit?: number;
    sortBy?: 'updatedAt' | 'createdAt' | 'id';
    order?: 'asc' | 'desc';
    includeNangoMetadata?: boolean;
    filter?: FilterAction | CombinedFilterAction;
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

export interface Metadata {
    [key: string]: string | Record<string, string>;
}

export interface Connection {
    id?: number;
    created_at?: string;
    updated_at?: string;
    provider_config_key: string;
    connection_id: string;
    connection_config: Record<string, string>;
    environment_id: number;
    metadata: Metadata | null;
    credentials_iv?: string | null;
    credentials_tag?: string | null;
    credentials: AuthCredentials;
}

export interface ConnectionList {
    id: number;
    connection_id: number;
    provider: string;
    created: string;
}

export interface IntegrationWithCreds extends Integration {
    client_id: string;
    client_secret: string;
    scopes: string;
}

interface Timestamps {
    created_at: string;
    updated_at: string;
}

export interface Sync extends Timestamps {
    id: string;
    name: string;
    connection_id: string;
    last_sync_date: string;
}

export interface Action extends Timestamps {
    name: string;
}

export interface Integration {
    unique_key: string;
    provider: string;
    syncs: Sync[];
    actions: Action[];
}

export interface SyncStatus {
    id: string;
    name: string;
    status: 'RUNNING' | 'SUCCESS' | 'ERROR' | 'PAUSED' | 'STOPPED';
    latestResult: Record<string, StatusAction>;
}

export interface StatusAction {
    added: number;
    updated: number;
    deleted?: number;
}

export interface SyncStatusResponse {
    syncs: SyncStatus[];
}
