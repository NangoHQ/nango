import type { ApiEndpoint, ApiError } from '../index.js';

export type PostImpersonate = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'TODO: audit coverage pending' };
    Method: 'POST';
    Path: `/api/v1/admin/impersonate`;
    Querystring: {
        env: string;
    };
    Body: {
        accountUUID: string;
        loginReason: string;
        code?: string | undefined;
    };
    Error: ApiError<'invalid_mfa_code'> | ApiError<'mfa_code_required'> | ApiError<'mfa_not_enabled'>;
    Success: { success: true };
}>;
