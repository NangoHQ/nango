export interface Data247Response {
    response?: {
        // OK on success, otherwise a D247_* error code
        status?: string;
        message?: string;
        results?: unknown[];
    };
}
