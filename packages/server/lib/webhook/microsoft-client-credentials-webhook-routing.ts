import { Err, Ok } from '@nangohq/utils';

import type { WebhookHandler } from './types.js';

interface MicrosoftNotification {
    tenantId?: string;
    changeType?: string;
    lifecycleEvent?: string;
    clientState?: string | null;
    resourceData?: Record<string, string>;
    resource?: string;
    subscriptionExpirationDateTime?: string;
    subscriptionId?: string;
}

interface MicrosoftNotificationPayload {
    value?: MicrosoftNotification[];
}

const route: WebhookHandler<MicrosoftNotificationPayload> = async (nango, _headers, body, _rawBody, query) => {
    const payload = body;

    // Microsoft Graph sends validationToken in query for subscription (first call) validation
    const validationToken = query && typeof query['validationToken'] === 'string' ? query['validationToken'] : null;

    if (validationToken) {
        return Ok({ content: validationToken, statusCode: 200 });
    }

    const notifications = payload.value;
    if (!Array.isArray(notifications) || notifications.length === 0) {
        return Ok({ content: { status: 'success' }, statusCode: 200 });
    }

    const expectedClientState = nango.integration.custom?.['webhookSecret'];
    const validNotifications = expectedClientState ? notifications.filter((n) => n.clientState === expectedClientState) : notifications;

    if (validNotifications.length === 0) {
        return Err('webhook_invalid_client_state');
    }

    const connectionIds = new Set<string>();

    for (const notification of validNotifications) {
        const response = await nango.executeScriptForWebhooks({
            body: notification,
            webhookType: 'changeType',
            connectionIdentifier: 'tenantId',
            propName: 'tenantId'
        });

        for (const connectionId of response?.connectionIds || []) {
            connectionIds.add(connectionId);
        }
    }

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: Array.from(connectionIds),
        toForward: payload
    });
};

export default route;
