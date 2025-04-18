export interface RunnerOutputError {
    type: string;
    payload: Record<string, unknown> | unknown[];
    status: number;
    additional_properties?: Record<string, unknown> | undefined;
}

export interface RunnerOutput {
    success: boolean;
    error: RunnerOutputError | null;
    response?: unknown; // TODO: define response type
    stats: RunnerStats;
}

export interface RunnerFlags {
    validateActionInput: boolean;
    validateActionOutput: boolean;
    validateSyncRecords: boolean;
    validateSyncMetadata: boolean;
}

export interface RunnerStats {
    proxy_success_egress_bytes: number;
    proxy_success_ingress_bytes: number;
    proxy_failure_egress_bytes: number;
    proxy_failure_ingress_bytes: number;
}
