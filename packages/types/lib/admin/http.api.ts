import type { ApiEndpoint } from '../index.js';

export type PostImpersonate = ApiEndpoint<{
    Audit: { reason: 'TODO: audit coverage pending' };
    Method: 'POST';
    Path: `/api/v1/admin/impersonate`;
    Querystring: {
        env: string;
    };
    Body: {
        accountUUID: string;
        loginReason: string;
    };
    Success: { success: true };
}>;
