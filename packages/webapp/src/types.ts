export interface ActivityResponse {
    level: 'info' | 'debug' | 'error';
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
}

export interface SyncResponse {
    id: number;
    created_at: Date;
    nango_connection_id: number;
    status: 'SUCCESS' | 'STOPPED' | 'RUNNING' | 'PAUSED';
    sync_name: string;
    type: 'INITIAL' | 'INCREMENTAL';
    updated_at: Date;
    models: string[];
}
