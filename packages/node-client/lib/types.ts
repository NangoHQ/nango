import type {
    AllAuthCredentials,
    ApiKeyCredentials,
    ApiProvider,
    ApiPublicConnectionFull,
    ApiPublicIntegration,
    AppCredentials,
    AppStoreCredentials,
    AuthModeType,
    AuthModes,
    AuthOperation,
    AuthOperationType,
    BasicApiCredentials,
    BillCredentials,
    CredentialsCommon,
    CustomCredentials,
    GetPublicConnection,
    GetPublicConnections,
    GetPublicIntegration,
    GetPublicListIntegrations,
    GetPublicListIntegrationsLegacy,
    GetPublicProvider,
    GetPublicProviders,
    GetPublicRecords,
    HTTP_METHOD,
    JwtCredentials,
    NangoAuthWebhookBody,
    NangoAuthWebhookBodyError,
    NangoAuthWebhookBodySuccess,
    NangoRecord,
    NangoSyncConfig,
    NangoSyncEndpointV2,
    NangoSyncWebhookBody,
    NangoSyncWebhookBodyError,
    NangoSyncWebhookBodySuccess,
    NangoWebhookBody,
    OAuth1Credentials,
    OAuth1Token,
    OAuth2ClientCredentials,
    OAuth2Credentials,
    PostConnectSessions,
    PostPublicConnectSessionsReconnect,
    RecordLastAction,
    RecordMetadata,
    StandardNangoConfig,
    TbaCredentials,
    TwoStepCredentials,
    UnauthCredentials,
    UserProvidedProxyConfiguration
} from '@nangohq/types';

export type {
    NangoAuthWebhookBody,
    NangoAuthWebhookBodyError,
    NangoAuthWebhookBodySuccess,
    NangoSyncWebhookBody,
    NangoSyncWebhookBodyError,
    NangoSyncWebhookBodySuccess,
    NangoWebhookBody
};
export type {
    AllAuthCredentials,
    ApiKeyCredentials,
    AppCredentials,
    AppStoreCredentials,
    AuthModeType,
    AuthModes,
    AuthOperation,
    AuthOperationType,
    BasicApiCredentials,
    BillCredentials,
    CredentialsCommon,
    CustomCredentials,
    JwtCredentials,
    OAuth1Credentials,
    OAuth1Token,
    OAuth2ClientCredentials,
    OAuth2Credentials,
    TbaCredentials,
    TwoStepCredentials,
    UnauthCredentials
};
export type { HTTP_METHOD, NangoSyncEndpointV2 };
export type { NangoRecord, RecordLastAction, RecordMetadata };

export type {
    ApiProvider,
    ApiPublicConnectionFull,
    ApiPublicIntegration,
    GetPublicConnection,
    GetPublicConnections,
    GetPublicIntegration,
    GetPublicListIntegrations,
    GetPublicListIntegrationsLegacy,
    GetPublicProvider,
    GetPublicProviders,
    GetPublicRecords,
    PostConnectSessions,
    PostPublicConnectSessionsReconnect
};

export type { NangoSyncConfig, StandardNangoConfig };

export interface NangoProps {
    host?: string;
    secretKey: string;
    connectionId?: string;
    providerConfigKey?: string;
    isSync?: boolean;
    dryRun?: boolean;
    activityLogId?: string | undefined;
}

export type ProxyConfiguration = Omit<UserProvidedProxyConfiguration, 'files' | 'providerConfigKey'> & {
    providerConfigKey?: string;
    connectionId?: string;
};

export type FilterAction = 'added' | 'updated' | 'deleted' | 'ADDED' | 'UPDATED' | 'DELETED';
export type CombinedFilterAction = `${FilterAction},${FilterAction}`;

export interface ListRecordsRequestConfig {
    providerConfigKey: string;
    connectionId: string;
    model: string;
    variant?: string;
    /**
     * @deprecated use modifiedAfter
     */
    delta?: string;
    modifiedAfter?: string;
    limit?: number;
    filter?: FilterAction | CombinedFilterAction;
    cursor?: string | null;
    ids?: string[];
}

export type Metadata = Record<string, unknown>;

export interface MetadataChangeResponse {
    metadata: Metadata;
    provider_config_key: string;
    connection_id: string | string[];
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

export interface SyncStatus {
    id: string;
    type: SyncType;
    finishedAt: string | undefined;
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

export interface SyncResult {
    added: number;
    updated: number;
    deleted: number;
}
