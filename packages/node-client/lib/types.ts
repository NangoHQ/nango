import type { ParamsSerializerOptions } from 'axios';
import type {
    NangoSyncWebhookBodySuccess,
    NangoSyncWebhookBodyError,
    NangoSyncWebhookBody,
    NangoAuthWebhookBodySuccess,
    NangoAuthWebhookBodyError,
    NangoAuthWebhookBody,
    NangoWebhookBody,
    AuthOperation,
    AuthOperationType,
    AuthModeType,
    AuthModes,
    HTTP_VERB,
    NangoSyncEndpoint,
    AllAuthCredentials,
    OAuth1Credentials,
    OAuth2Credentials,
    OAuth2ClientCredentials,
    BasicApiCredentials,
    ApiKeyCredentials,
    AppCredentials,
    AppStoreCredentials,
    UnauthCredentials,
    CustomCredentials,
    TbaCredentials
} from '@nangohq/types';

export type {
    NangoSyncWebhookBodySuccess,
    NangoSyncWebhookBodyError,
    NangoSyncWebhookBody,
    NangoAuthWebhookBodySuccess,
    NangoAuthWebhookBodyError,
    NangoAuthWebhookBody,
    NangoWebhookBody
};
export type {
    AuthOperation,
    AuthOperationType,
    AuthModeType,
    AuthModes,
    AllAuthCredentials,
    OAuth1Credentials,
    OAuth2Credentials,
    OAuth2ClientCredentials,
    BasicApiCredentials,
    ApiKeyCredentials,
    AppCredentials,
    AppStoreCredentials,
    UnauthCredentials,
    CustomCredentials,
    TbaCredentials
};
export type { HTTP_VERB, NangoSyncEndpoint };

export interface NangoProps {
    host?: string;
    secretKey: string;
    connectionId?: string;
    providerConfigKey?: string;
    isSync?: boolean;
    dryRun?: boolean;
    activityLogId?: string | undefined;
}

export interface CreateConnectionOAuth1 extends OAuth1Credentials {
    connection_id: string;
    provider_config_key: string;
    type: AuthModes['OAuth1'];
}

export interface OAuth1Token {
    oAuthToken: string;
    oAuthTokenSecret: string;
}

export interface CreateConnectionOAuth2 extends OAuth2Credentials {
    connection_id: string;
    provider_config_key: string;
    type: AuthModes['OAuth2'];
}

export interface ProxyConfiguration {
    endpoint: string;
    providerConfigKey?: string;
    connectionId?: string;

    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' | 'get' | 'post' | 'patch' | 'put' | 'delete';
    headers?: Record<string, string>;
    params?: string | Record<string, string | number>;
    paramsSerializer?: ParamsSerializerOptions;
    data?: unknown;
    retries?: number;
    baseUrlOverride?: string;
    decompress?: boolean;
    responseType?: 'arraybuffer' | 'blob' | 'document' | 'json' | 'text' | 'stream';
    retryOn?: number[] | null;
}

export type FilterAction = 'added' | 'updated' | 'deleted' | 'ADDED' | 'UPDATED' | 'DELETED';
export type CombinedFilterAction = `${FilterAction},${FilterAction}`;

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

export interface ListRecordsRequestConfig {
    providerConfigKey: string;
    connectionId: string;
    model: string;
    /**
     * @deprecated use modifiedAfter
     */
    delta?: string;
    modifiedAfter?: string;
    limit?: number;
    filter?: FilterAction | CombinedFilterAction;
    cursor?: string | null;
}

export type Metadata = Record<string, unknown>;

export interface MetadataChangeResponse {
    metadata: Metadata;
    provider_config_key: string;
    connection_id: string | string[];
}

export interface Connection {
    id?: number;
    created_at: Date;
    updated_at: Date;
    provider_config_key: string;
    connection_id: string;
    connection_config: Record<string, string>;
    environment_id: number;
    metadata?: Metadata | null;
    credentials_iv?: string | null;
    credentials_tag?: string | null;
    credentials: AllAuthCredentials;
}

export interface ConnectionList {
    id: number;
    connection_id: string;
    provider_config_key: string;
    provider: string;
    created: string;
    metadata?: Metadata | null;
}

export interface IntegrationWithCreds extends Integration {
    client_id: string;
    client_secret: string;
    scopes: string;
    created_at: Date;
    has_webhook: boolean;
    webhook_url?: string;
}

export interface Timestamps {
    created_at: string;
    updated_at: string;
}

export interface Sync extends Timestamps {
    id: string;
    name: string;
    connection_id: string;
    last_sync_date: string;
}

export interface SyncConfig extends Timestamps {
    name: string;
    description?: string;
}

export interface Action extends Timestamps {
    name: string;
}

export type SyncType = 'INCREMENTAL' | 'INITIAL';

export interface Integration {
    unique_key: string;
    provider: string;
    syncs: SyncConfig[];
    actions: Action[];
}

export interface SyncStatus {
    id: string;
    type: SyncType;
    finishedAt: string;
    nextScheduledSyncAt: string;
    name: string;
    status: 'RUNNING' | 'SUCCESS' | 'ERROR' | 'PAUSED' | 'STOPPED';
    frequency: string;
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

export interface UpdateSyncFrequencyResponse {
    frequency: string;
}

export interface StandardNangoConfig {
    providerConfigKey: string;
    rawName?: string;
    provider?: string;
    syncs: NangoSyncConfig[];
    actions: NangoSyncConfig[];
    postConnectionScripts?: string[];
}

export enum SyncConfigType {
    SYNC = 'sync',
    ACTION = 'action'
}

interface NangoSyncModelField {
    name: string;
    type: string;
}

export interface NangoSyncModel {
    name: string;
    description?: string;
    fields: NangoSyncModelField[];
}

export interface NangoSyncConfig {
    name: string;
    type?: SyncConfigType;
    runs: string;
    auto_start?: boolean;
    attributes?: object;
    description?: string;
    scopes?: string[];
    track_deletes?: boolean;
    returns: string[];
    models: NangoSyncModel[];
    endpoints: NangoSyncEndpoint[];
    is_public?: boolean;
    pre_built?: boolean;
    version?: string | null;
    last_deployed?: string | null;

    input?: NangoSyncModel;
    sync_type?: SyncType;
    nango_yaml_version?: string;
    webhookSubscriptions?: string[];
}

export type LastAction = 'ADDED' | 'UPDATED' | 'DELETED';

export interface RecordMetadata {
    first_seen_at: string;
    last_seen_at: string;
    last_action: LastAction;
    deleted_at: string | null;
    cursor: string;
}

export interface SyncResult {
    added: number;
    updated: number;
    deleted: number;
}
