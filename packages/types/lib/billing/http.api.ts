import type { ApiEndpoint } from '../api.js';

export type PostOrbWebhooks = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'POST';
    Path: '/api/v1/orb/webhooks';
    Body: any;
    Headers: { 'X-Orb-Signature': string };
    Success: {
        success: boolean;
    };
}>;
