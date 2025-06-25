import type { Endpoint } from '../api';

export type PostOrbWebhooks = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/orb/webhooks';
    Body: any;
    Headers: { 'X-Orb-Signature': string };
    Success: {
        success: boolean;
    };
}>;
