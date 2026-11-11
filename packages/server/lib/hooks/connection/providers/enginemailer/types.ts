export interface EnginemailerResponse {
    Result?: {
        Status?: string;
        StatusCode?: string | number;
        ErrorMessage?: string;
        Data?: unknown;
    } | null;
}
