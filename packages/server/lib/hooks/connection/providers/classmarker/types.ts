export interface ClassmarkerResponse {
    // ok, no_results or error
    status?: string;
    error?: {
        error_code?: string;
        error_message?: string;
    };
}
