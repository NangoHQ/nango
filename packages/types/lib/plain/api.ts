import type { ApiEndpoint, ApiError } from '../api.js';

export type GetPlainHmac = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'GET';
    Path: `/api/v1/plain`;
    Success: { data: { hash: string } };
    Error: ApiError<'unauthorized'>;
}>;
