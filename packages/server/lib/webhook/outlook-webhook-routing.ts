import crypto from 'node:crypto';

import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import type { WebhookHandler } from './types.js';

interface OutlookNotification {
    subscriptionId?: string;
    clientState?: string | null;
    changeType?: string;
    resource?: string;
    resourceData?: {
        id?: string;
        '@odata.type'?: string;
        '@odata.id'?: string;
    };
}

interface OutlookNotificationPayload {
    value?: OutlookNotification[];
}

function safeCompare(expected: string, received: string): boolean {
    const expectedBuffer = Buffer.from(expected);
    const receivedBuffer = Buffer.from(received);
    return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

const route: WebhookHandler<OutlookNotificationPayload> = async (nango, _headers, body, _rawBody, query) => {
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

        const response = await nango.executeScriptForWebhooks({
            body: notification,
            webhookType: 'changeType',
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
