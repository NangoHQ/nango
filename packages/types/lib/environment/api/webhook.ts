import type { Endpoint } from '../../api.js';

export interface WebhookSettings {
    alwaysSendWebhook: boolean;
    sendAuthWebhook: boolean;
    sendRefreshFailedWebhook: boolean;
    sendSyncFailedWebhook: boolean;
}

export type UpdateWebhookSettings = Endpoint<{
    Method: 'PATCH';
    Querystring: {
        env: string;
    };
    Path: '/api/v1/environment/webhook/settings';
    Body: WebhookSettings;
    Success: WebhookSettings;
}>;

export type UpdatePrimaryUrl = Endpoint<{
    Method: 'PATCH';
    Querystring: {
        env: string;
    };
    Path: '/api/v1/environment/webhook/url/primary';
    Body: {
        url: string;
    };
    Success: {
        url: string;
    };
}>;

export type UpdateSecondaryUrl = Endpoint<{
    Method: 'PATCH';
    Querystring: {
        env: string;
    };
    Path: '/api/v1/environment/webhook/url/secondary';
    Body: {
        url: string;
    };
    Success: {
        url: string;
    };
}>;
