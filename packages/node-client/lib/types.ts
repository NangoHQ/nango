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
    AuthOperationType,
    BasicApiCredentials,
    BillCredentials,
    Checkpoint,
    CredentialsCommon,
    CustomCredentials,
    GetPublicConnection,
    GetPublicConnections,
    GetPublicIntegration,
    GetPublicListIntegrations,
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
    SyncResult,
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
    GetPublicProvider,
    GetPublicProviders,
    GetPublicRecords,
    PostConnectSessions,
    PostPublicConnectSessionsReconnect
};

export type { NangoSyncConfig, StandardNangoConfig, SyncResult };

interface NangoBaseProps {
    host?: string;
    /**
     * The environment's webhook signing key (Environment Settings → Webhooks → Signing key).
     * Used by `verifyIncomingWebhookRequest` to validate incoming webhook signatures.
     * Defaults to the API key when omitted. On environments created after 2026-04-20 (or any
     * environment that later rotated its API key), the signing key differs from the API key,
     * so set this explicitly to verify webhooks.
     */
    webhookSigningKey?: string;
    connectionId?: string;
    providerConfigKey?: string;
    isSync?: boolean;
    dryRun?: boolean;
    isScript?: boolean;
    activityLogId?: string | undefined;
}

/**
 * Credentials for the SDK. At least one of `apiKey` (preferred) or the deprecated `secretKey`
 * must be provided; this is enforced at compile time.
 */
export type NangoProps = NangoBaseProps &
    (
        | {
              /**
               * Your Nango environment API key (Environment Settings → API Keys).
               * Sent as the bearer token for API calls.
               */
              apiKey: string;
              /** @deprecated Use `apiKey` instead. Kept as an alias for backward compatibility. */
              secretKey?: string;
          }
        | {
              apiKey?: string;
              /** @deprecated Use `apiKey` instead. Kept as an alias for backward compatibility. */
              secretKey: string;
          }
    );

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

/** @deprecated */
export type SyncType = 'INCREMENTAL' | 'INITIAL';

export interface SyncStatus {
    id: string;
    /** @deprecated **/
    type: SyncType;
    finishedAt: string | undefined;
    nextScheduledSyncAt: string;
    name: string;
    status: 'RUNNING' | 'SUCCESS' | 'ERROR' | 'PAUSED' | 'STOPPED';
    frequency: string;
    latestResult: Record<string, StatusAction>;
    recordCount: Record<string, number>;
    checkpoint: Checkpoint | null;
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
