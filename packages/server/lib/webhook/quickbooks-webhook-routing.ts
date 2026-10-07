import crypto from 'node:crypto';

import { NangoError } from '@nangohq/shared';
import { Err, getLogger, Ok } from '@nangohq/utils';

import { safeCompare } from './signature.js';

import type { WebhookHandler } from './types.js';
import type { IntegrationConfig } from '@nangohq/types';

const logger = getLogger('Webhook.QuickBooks');

/**
 * Intuit (QuickBooks Online) webhook body. Intuit batches changes into one `eventNotifications`
 * entry per company (`realmId`), each carrying one or more entity changes.
 *
 * https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks
 */
export interface QuickBooksWebhookBody {
    eventNotifications: QuickBooksEventNotification[];
}

interface QuickBooksEventNotification {
    realmId: string;
    dataChangeEvent?: {
        entities?: QuickBooksEntity[];
    };
}

interface QuickBooksEntity {
    /** The QuickBooks entity name, e.g. `Invoice`, `Customer`, `Payment`. */
    name: string;
    id: string;
    operation: 'Create' | 'Update' | 'Delete' | 'Merge' | 'Void' | 'Emailed';
    lastUpdated: string;
}

/**
 * Intuit signs the **raw request body** with HMAC-SHA256 keyed by the app's **verifier token** and
 * sends the base64 digest in the `intuit-signature` header.
 *
 * The verifier token is user-supplied: it is the value shown next to the endpoint in the Intuit
 * developer portal (App → Webhooks), stored on the integration as the webhook secret.
 */
function validate(integration: IntegrationConfig, signature: string, rawBody: string): boolean {
    const verifierToken = integration.custom?.['webhookSecret'];
    if (!verifierToken) {
        logger.error('Missing verifier token for signature validation', { configId: integration.id });
        return false;
    }

    const calculatedSignature = crypto.createHmac('sha256', verifierToken).update(rawBody).digest('base64');
    return safeCompare(calculatedSignature, signature);
}

const route: WebhookHandler<QuickBooksWebhookBody> = async (nango, headers, body, rawBody) => {
    const signature = headers['intuit-signature'];
    if (!signature) {
        logger.error('Missing intuit-signature header', { configId: nango.integration.id });
        return Err(new NangoError('webhook_missing_signature'));
    }

    if (!validate(nango.integration, signature, rawBody)) {
        logger.error('Invalid signature', { configId: nango.integration.id });
        return Err(new NangoError('webhook_invalid_signature'));
    }

    const notifications = Array.isArray(body?.eventNotifications) ? body.eventNotifications : [];
    if (notifications.length === 0) {
        // Intuit's endpoint-verification ping carries no events; acknowledge it with the same 200.
        return Ok({ content: { status: 'success' }, statusCode: 200 });
    }

    const connectionIds: string[] = [];
    for (const notification of notifications) {
        if (typeof notification?.realmId !== 'string' || notification.realmId.length === 0) {
            continue;
        }

        // The realm id is stored on the connection at creation time (`redirect_uri_metadata:
        // [realmId]` in providers.yaml), so routing by it needs no per-connection webhook URL and
        // no query parameter. The first entity name is used as the event type so a function can
        // subscribe to e.g. `Invoice`; `['*']` matches every delivery.
        const response = await nango.executeScriptForWebhooks({
            payload: body,
            webhookTypeValue: notification.dataChangeEvent?.entities?.[0]?.name,
            connectionIdentifierValue: notification.realmId,
            propName: 'realmId'
        });
        connectionIds.push(...(response.connectionIds ?? []));
    }

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds,
        toForward: body
    });
};

export default route;
