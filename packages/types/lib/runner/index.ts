export interface RunnerOutputError {
    type: string;
    payload: Record<string, unknown>;
    stack?: string;
    status: number;
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
