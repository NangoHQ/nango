import type { Endpoint } from '../index.js';

export type PostImpersonate = Endpoint<{
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
