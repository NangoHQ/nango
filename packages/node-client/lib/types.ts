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
    HTTP_METHOD,
    NangoSyncEndpointV2,
    AllAuthCredentials,
    OAuth1Token,
    OAuth1Credentials,
    OAuth2Credentials,
    OAuth2ClientCredentials,
    BasicApiCredentials,
    ApiKeyCredentials,
    AppCredentials,
    AppStoreCredentials,
    UnauthCredentials,
    CustomCredentials,
    TbaCredentials,
    RecordMetadata,
    RecordLastAction,
    NangoRecord,
    JwtCredentials,
    TwoStepCredentials,
    CredentialsCommon,
    TableauCredentials,
    BillCredentials,
    GetPublicProviders,
    GetPublicProvider,
    GetPublicListIntegrations,
    GetPublicListIntegrationsLegacy,
    GetPublicIntegration,
    GetPublicConnections,
    GetPublicConnection,
    PostConnectSessions,
    PostPublicConnectSessionsReconnect
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
    OAuth1Token,
    OAuth1Credentials,
    OAuth2Credentials,
    OAuth2ClientCredentials,
    BasicApiCredentials,
    ApiKeyCredentials,
    AppCredentials,
    AppStoreCredentials,
    UnauthCredentials,
    CustomCredentials,
    CredentialsCommon,
    TableauCredentials,
    BillCredentials,
    TbaCredentials,
    JwtCredentials,
    TwoStepCredentials
};
export type { HTTP_METHOD, NangoSyncEndpointV2 };
export type { RecordMetadata, RecordLastAction, NangoRecord };

export type {
    GetPublicProviders,
    GetPublicProvider,
    GetPublicListIntegrations,
    GetPublicListIntegrationsLegacy,
    GetPublicIntegration,
    GetPublicConnections,
    GetPublicConnection,
    PostConnectSessions,
    PostPublicConnectSessionsReconnect
};

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
    decompress?: boolean | string;
    responseType?: 'arraybuffer' | 'blob' | 'document' | 'json' | 'text' | 'stream';
    retryOn?: number[] | null;
}

export type FilterAction = 'added' | 'updated' | 'deleted' | 'ADDED' | 'UPDATED' | 'DELETED';
export type CombinedFilterAction = `${FilterAction},${FilterAction}`;

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
    recordCount: Record<string, number>;
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
    endpoints: NangoSyncEndpointV2[];
    is_public?: boolean;
    pre_built?: boolean;
    version?: string | null;
    last_deployed?: string | null;

    input?: NangoSyncModel;
    sync_type?: SyncType;
    webhookSubscriptions?: string[];
}

export interface SyncResult {
    added: number;
    updated: number;
    deleted: number;
}
