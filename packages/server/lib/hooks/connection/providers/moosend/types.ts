// Every Moosend response body is this envelope: `Code` is 0 and `Error` is null on success
export interface MoosendResponse {
    Code?: number;
    Error?: string | null;
    Context?: unknown;
}
