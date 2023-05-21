export enum SyncStatus {
    RUNNING = 'RUNNING',
    PAUSED = 'PAUSED',
    STOPPED = 'STOPPED',
    SUCCESS = 'SUCCESS'
}

export enum SyncType {
    INITIAL = 'INITIAL',
    INCREMENTAL = 'INCREMENTAL'
}

export interface Sync {
    id: number;
    nango_connection_id: number;
    sync_name: string;
    status: SyncStatus;
    type: SyncType;
    created_at?: Date;
    updated_at?: Date;
}

export interface SyncConfig {
    id: number;
    account_id: number;
    provider: string;
    integration_name: string;
    snippet: string;
}

export interface SyncRecordConfiguration {
    [key: string]: string;

    connectionId: string;
    providerConfigKey: string;
    model: string;
}
