export interface RunnerOutput {
    success: boolean;
    error: { type: string; payload: Record<string, unknown>; status: number } | null;
    response?: any; // TODO: define response type
}
