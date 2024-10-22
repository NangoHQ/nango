import type { NangoModel, SyncTypeLiteral, AuthModeType, NangoSyncEndpoint, ActiveLog } from '@nangohq/types';

export type SyncResult = Record<string, Result>;

export interface Result {
    added: number;
    updated: number;
    deleted: number;
}

export interface Sync {
    id: string;
    sync_name: string;
    type: string;
    provider: string;
    runs: string;
    auto_start: boolean;
    unique_key: string;
    models: string[];
    updated_at: string;
    version: string;
    pre_built: boolean;
    is_public: boolean;
    connections:
        | {
              connection_id: string;
              metadata?: Record<string, string | Record<string, string>>;
          }[]
        | null;
    metadata?: {
        description?: string;
        scopes?: string[];
    };
}

export interface SyncResponse {
    id: string;
    created_at: string;
    nango_connection_id: number;
    name: string;
    frequency: string;
    frequency_override: string | null;
    futureActionTimes: number[];
    offset: number;
    schedule_status: 'STARTED' | 'PAUSED' | 'DELETED';
    models: string | string[];
    schedule_id: string;
    status: 'SUCCESS' | 'RUNNING' | 'STOPPED' | 'PAUSED' | 'ERROR';
    sync_type: SyncTypeLiteral;
    latest_sync: {
        created_at: string;
        updated_at: string;
        type: 'INITIAL' | 'INCREMENTAL';
        status: 'SUCCESS' | 'STOPPED' | 'RUNNING' | 'PAUSED';
        result: SyncResult;
        job_id: string;
        sync_config_id: number;
        version: string;
        models: string[];
    };
    active_logs: Pick<ActiveLog, 'log_id'> | null;
    object_count: number;
}

export type RunSyncCommand = 'PAUSE' | 'UNPAUSE' | 'RUN' | 'RUN_FULL' | 'CANCEL';

export const UserFacingSyncCommand = {
    PAUSE: 'paused',
    UNPAUSE: 'resumed',
    RUN: 'triggered',
    RUN_FULL: 'run full',
    CANCEL: 'cancelled'
};

export interface Connection {
    id: number;
    connection_id: string;
    provider: string;
    providerConfigKey: string;
    creationDate: string;
    oauthType: string;
    connectionConfig: Record<string, string>;
    connectionMetadata: Record<string, string>;
    accessToken: string | null;
    refreshToken: string | null;
    expiresAt: string | null;
    oauthToken: string | null;
    oauthTokenSecret: string | null;
    rawCredentials: object;
    credentials: BasicApiCredentials | ApiKeyCredentials | OAuthOverride | OAuth2ClientCredentials | null;
}

export interface BasicApiCredentials {
    username: string;
    password: string;
}

export interface ApiKeyCredentials {
    apiKey: string;
}

export interface OAuthOverride {
    config_override: {
        client_id: string;
        client_secret: string;
    };
}

export interface OAuth2ClientCredentials {
    token: string;
    access_token: string;
    expires_at: string;
    client_id: string;
    client_secret: string;
}

export interface FlowEndpoint {
    GET?: string;
    POST?: string;
    PUT?: string;
    PATCH?: string;
    DELETE?: string;
}

interface NangoSyncModelField {
    name: string;
    type: string;
    description?: string;
}

export interface NangoSyncModel {
    name: string;
    description?: string;
    fields: NangoSyncModelField[];
}

export interface Flow {
    id?: number;
    attributes: Record<string, unknown>;
    endpoints: NangoSyncEndpoint[];
    scopes: string[];
    enabled: boolean;
    sync_type?: 'FULL' | 'INCREMENTAL';
    is_public: boolean;
    pre_built: boolean;
    version?: string;
    upgrade_version?: string;
    last_deployed?: string;
    input?: NangoSyncModel;
    description: string;
    name: string;
    returns: string | string[];
    output?: string;
    type: 'sync' | 'action';
    runs?: string;
    track_deletes: boolean;
    auto_start?: boolean;
    endpoint?: string;
    models: NangoSyncModel[] | NangoModel[];
    nango_yaml_version: 'v1' | 'v2';
    webhookSubscriptions: string[];
}

export interface IntegrationConfig {
    unique_key: string;
    provider: string;
    client_id: string;
    client_secret: string;
    app_link?: string;
    has_webhook: boolean;
    has_webhook_user_defined_secret?: boolean;
    scopes: string;
    auth_mode: AuthModeType;
    created_at: string;
    webhook_secret?: string;
    custom?: Record<string, string>;
    connection_count: number;
    connections: Connection[];
    docs: string;
}
