export interface ApiSportsStatusResponse {
    get?: string;
    // an empty array when there is no error, an object keyed by error type (e.g. `token`, `rateLimit`) otherwise
    errors?: unknown[] | Record<string, unknown>;
    results?: number;
    response?: unknown;
}
