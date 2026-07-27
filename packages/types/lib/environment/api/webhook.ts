import type { ApiEndpoint } from '../../api.js';

export type PatchWebhook = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'TODO: audit coverage pending' };
    Method: 'PATCH';
    Querystring: {
        env: string;
    };
    Path: '/api/v1/environments/webhook';
    Body: {
        primary_url?: string | undefined;
        secondary_url?: string | undefined;
        on_sync_completion_always?: boolean | undefined;
        on_auth_creation?: boolean | undefined;
        on_auth_refresh_error?: boolean | undefined;
        on_sync_error?: boolean | undefined;
        on_async_action_completion?: boolean | undefined;
    };
    Success: {
        success: boolean;
    };
}>;
