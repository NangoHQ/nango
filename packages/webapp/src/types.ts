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
    created_at: string;
    nango_connection_id: number;
    name: string;
    models: string[];
    frequency: string;
    latest_sync: {
        updated_at: string;
        type: 'INITIAL' | 'INCREMENTAL';
        status: 'SUCCESS' | 'STOPPED' | 'RUNNING' | 'PAUSED';
        result: {
            added: number;
            updated: number;
            deleted?: number;
        };
    };
}
