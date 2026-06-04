export interface ExecutionEvent {
    id: string;
    environment_id: number;
    integration_id: string;
    connection_id: string;
    provider: string;
    type: 'SYNC' | 'ACTION';
    status: 'STARTED' | 'SUCCESS' | 'FAILURE';
    duration_ms?: number;
    retries?: number;
    api_calls_count?: number;
    error_type?: string;
    error_message?: string;
    created_at: Date;
}

export interface IntegrationHealthMetric {
    id: string;
    environment_id: number;
    integration_id: string;
    connection_id: string;
    provider: string;
    status: 'HEALTHY' | 'DEGRADED' | 'FAILING' | 'PAUSED';
    last_success_at?: Date;
    last_failure_at?: Date;
    success_count_24h: number;
    failure_count_24h: number;
    avg_runtime_ms?: number;
    api_calls_24h: number;
    top_error_type?: string;
    updated_at: Date;
}
