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
    proxy_egress_bytes: number;
    proxy_ingress_bytes: number;
}
