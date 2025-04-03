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
    PostPublicConnectSessionsReconnect,
    GetPublicRecords,
    UserProvidedProxyConfiguration,
    StandardNangoConfig,
    NangoSyncConfig
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
    PostPublicConnectSessionsReconnect,
    GetPublicRecords
};

export type { StandardNangoConfig, NangoSyncConfig };

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
