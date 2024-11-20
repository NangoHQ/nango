export interface RunnerOutputError {
    type: string;
    payload: Record<string, unknown>;
    status: number;
}
export interface RunnerOutput {
    success: boolean;
    error: RunnerOutputError | null;
    response?: any; // TODO: define response type
}
