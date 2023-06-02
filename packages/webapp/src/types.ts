export interface ActivityResponse {
    id: number;
    level: 'info' | 'debug' | 'error' | 'warn';
    action: 'oauth' | 'proxy' | 'token' | 'sync';
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

export interface SyncResponse {
    id: number;
    created_at: string;
    nango_connection_id: number;
    name: string;
    models: string[];
    frequency: string;
    schedule_status: 'RUNNING' | 'PAUSED' | 'STOPPED';
    schedule_id: string;
    latest_sync: {
        updated_at: string;
        type: 'INITIAL' | 'INCREMENTAL';
        status: 'SUCCESS' | 'STOPPED' | 'RUNNING' | 'PAUSED';
        activity_log_id: number | null;
        result: {
            added: number;
            updated: number;
            deleted?: number;
        };
    };
}

export type RunSyncCommand = 'PAUSE' | 'UNPAUSE' | 'RUN' | 'RUN_FULL';
