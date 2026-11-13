import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { safeCompare } from './signature.js';

import type { MicrosoftEntraIdNotificationPayload, WebhookHandler } from './types.js';

// Microsoft Graph change notifications for directory resources such as users and groups. Every
// notification carries the integration's clientState and the id of the subscription it came from,
// which is matched against the connection's `metadata.subscriptionIds`.
// https://learn.microsoft.com/en-us/graph/change-notifications-delivery-webhooks
const route: WebhookHandler<MicrosoftEntraIdNotificationPayload> = async (nango, _headers, body, _rawBody, query) => {
    // Sent when a subscription is created, for both the notification and the lifecycle notification URL.
    const validationToken = query && typeof query['validationToken'] === 'string' ? query['validationToken'] : null;
    if (validationToken) {
        return Ok({ content: validationToken, statusCode: 200 });
    }

    const notifications = body?.value;
    if (!Array.isArray(notifications) || notifications.length === 0) {
        return Ok({ content: { status: 'success' }, statusCode: 200 });
    }

    const expectedClientState = nango.integration.custom?.['webhookSecret'];
    if (!expectedClientState || typeof expectedClientState !== 'string') {
        return Err(new NangoError('webhook_missing_signature'));
    }

    const validNotifications = notifications
        .filter((n) => n !== null && typeof n.clientState === 'string' && safeCompare(expectedClientState, n.clientState))
        .map(({ clientState: _clientState, ...notification }) => notification);
    if (validNotifications.length === 0) {
        return Err(new NangoError('webhook_invalid_signature'));
    }

    const connectionIds = new Set<string>();

    for (const notification of validNotifications) {
        const subscriptionId = notification.subscriptionId;
        if (!subscriptionId) {
            continue;
        }

        // Lifecycle notifications, such as reauthorizationRequired, have a lifecycleEvent instead of a changeType.
        const type = notification.changeType ?? notification.lifecycleEvent;

        const response = await nango.executeScriptForWebhooks({
            payload: notification,
            ...(type ? { webhookTypeValue: type } : {}),
            connectionIdentifierValue: subscriptionId,
            propName: 'metadata.subscriptionIds'
        });

        for (const connectionId of response.connectionIds) {
            connectionIds.add(connectionId);
        }
    }

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: Array.from(connectionIds),
        toForward: { value: validNotifications }
    });
};

export default route;
