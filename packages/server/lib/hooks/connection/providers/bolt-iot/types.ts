export interface BoltIotResponse {
    // 1 when the request succeeded, 0 when the API key is invalid or the request failed
    success?: number | string;
    // the plan name on success (`Bolt Cloud` or `Bolt Cloud Pro`), an error message otherwise (e.g. `Invalid API key`)
    value?: unknown;
}
