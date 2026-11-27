import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { safeCompare } from './signature.js';

import type { MicrosoftGraphNotification, MicrosoftGraphNotificationPayload, WebhookForwardGroup, WebhookHandler } from './types.js';

// Microsoft Graph change and lifecycle notifications (mail, calendar, directory, ...). Each one carries
// the integration's clientState and its subscriptionId, matched against `metadata.subscriptionIds`.
// https://learn.microsoft.com/en-us/graph/change-notifications-delivery-webhooks
const route: WebhookHandler<MicrosoftGraphNotificationPayload> = async (nango, _headers, body, _rawBody, query) => {
    // Sent when a subscription is created, for both the notification and the lifecycle notification URL.
    const validationToken = query && typeof query['validationToken'] === 'string' ? query['validationToken'] : null;
    // Neither this nor an empty batch carries a clientState, so they are answered but never forwarded.
    if (validationToken) {
        return Ok({ content: validationToken, statusCode: 200, noForward: true });
    }

    const notifications = body?.value;
    if (!Array.isArray(notifications) || notifications.length === 0) {
        return Ok({ content: { status: 'success' }, statusCode: 200, noForward: true });
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

    // Graph batches notifications from different subscriptions, so different connections, into one request.
    // Each connection is forwarded only its own notifications.
    const byConnection = new Map<string, MicrosoftGraphNotification[]>();
    const unmatched: MicrosoftGraphNotification[] = [];

    for (const notification of validNotifications) {
        const subscriptionId = notification.subscriptionId;
        if (!subscriptionId) {
            unmatched.push(notification);
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

        if (response.connectionIds.length === 0) {
            unmatched.push(notification);
        }
        for (const connectionId of response.connectionIds) {
            byConnection.set(connectionId, [...(byConnection.get(connectionId) ?? []), notification]);
        }
    }

    const forwardGroups: WebhookForwardGroup[] = Array.from(byConnection, ([connectionId, value]) => ({ connectionIds: [connectionId], payload: { value } }));
    if (unmatched.length > 0) {
        forwardGroups.push({ connectionIds: [], payload: { value: unmatched } });
    }

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: Array.from(byConnection.keys()),
        forwardGroups
    });
};

export default route;
