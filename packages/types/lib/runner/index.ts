export interface RunnerOutputError {
    type: string;
    payload: Record<string, unknown>;
    status: number;
    upstream_response?: {
        status: number;
        headers: Record<string, string>;
        body: Record<string, unknown>;
    };
}
export interface RunnerOutput {
    success: boolean;
    error: RunnerOutputError | null;
    response?: any; // TODO: define response type
}

export interface RunnerFlags {
    validateActionInput: boolean;
    validateActionOutput: boolean;
    validateSyncRecords: boolean;
    validateSyncMetadata: boolean;
}
