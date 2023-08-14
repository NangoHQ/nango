export interface ActivityResponse {
    id: number;
    level: 'info' | 'debug' | 'error' | 'warn';
    action: 'oauth' | 'auth' | 'proxy' | 'token' | 'sync' | 'sync deploy' | 'pause sync' | 'restart sync' | 'trigger sync';
    success: boolean;
    timestamp: number;
    start: number;
    end: number;
    message: string;
    messages: {
        [index: string]: undefined | string | number;
    }[];
    connection_id: string;
    provider_config_key: string;
    provider: string;
    method: string;
    endpoint?: string;
    operation_name?: string;
}

export interface SyncResult {
    [key: string]: Result;
}

export interface Result {
    added: number;
    updated: number;
    deleted?: number;
}

export interface Sync {
    id: string;
    sync_name: string;
    provider: string;
    runs: string;
    unique_key: string;
    models: string[];
    updated_at: string;
    version: string;
    connections:
        | {
              connection_id: string;
              metadata?: {
                  fieldMapping: Record<string, string>;
                  [key: string]: string | Record<string, string>;
              };
          }[]
        | null;
}

export interface SyncResponse {
    id: number;
    created_at: string;
    nango_connection_id: number;
    name: string;
    frequency: string;
    futureActionTimes: number[];
    offset: number;
    schedule_status: 'RUNNING' | 'PAUSED' | 'STOPPED';
    schedule_id: string;
    latest_sync: {
        updated_at: string;
        type: 'INITIAL' | 'INCREMENTAL';
        status: 'SUCCESS' | 'STOPPED' | 'RUNNING' | 'PAUSED';
        activity_log_id: number | null;
        result: SyncResult;
        job_id: string;
        sync_config_id: number;
        version: string;
        models: string[];
    };
}

export type RunSyncCommand = 'PAUSE' | 'UNPAUSE' | 'RUN' | 'RUN_FULL';

export enum AuthModes {
    OAuth1 = 'OAUTH1',
    OAuth2 = 'OAUTH2',
    Basic = 'BASIC',
    ApiKey = 'API_KEY'
}

export interface BasicApiCredentials {
    [key: string]: string;
    username: string;
    password: string;
}

export interface ApiKeyCredentials {
    [key: string]: string;
    apiKey: string;
}

export interface User {
    id: number;
    email: string;
    name: string;
    suspended: boolean;
    currentUser?: boolean;
}

export interface InvitedUser {
    id: number;
    email: string;
    name: string;
    expires_at: string;
    token: string;
    accepted: boolean;
}
