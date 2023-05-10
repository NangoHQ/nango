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
    status: SyncStatus;
    type: SyncType;
    created_at?: Date;
    updated_at?: Date;
}
