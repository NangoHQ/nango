import type { ApiEndpoint } from '../../api.js';
import type { AuditPolicy } from '../../audit-trail/event.js';

export type PatchWebhook = ApiEndpoint<{
    Audit: AuditPolicy<'environment', 'webhook_urls_changed', 'environment'>;
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
        on_connection_deletion?: boolean | undefined;
    };
    Success: {
        success: boolean;
    };
}>;
