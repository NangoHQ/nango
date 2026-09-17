import crypto from 'node:crypto';

import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import type { GranolaWebhookPayload, WebhookHandler } from './types.js';

// Granola signs webhook deliveries per the Standard Webhooks spec.
function validate(secret: string, msgId: string, msgTimestamp: string, msgSignature: string, rawBody: string | Buffer): boolean {
    const now = Math.floor(Date.now() / 1000);
    const timestamp = parseInt(msgTimestamp, 10);
    const tolerance = 5 * 60;

    if (isNaN(timestamp) || Math.abs(now - timestamp) > tolerance) {
        return false;
    }

    const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
    const payloadString = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
    const toSign = `${msgId}.${msgTimestamp}.${payloadString}`;
    const expected = crypto.createHmac('sha256', secretBytes).update(toSign, 'utf8').digest('base64');
    const expectedBuf = Buffer.from(expected, 'base64');

    return msgSignature.split(' ').some((versionedSignature) => {
        const [version, signature] = versionedSignature.split(',');
        if (version !== 'v1' || !signature) {
            return false;
        }

        try {
            const providedBuf = Buffer.from(signature, 'base64');
            return providedBuf.length === expectedBuf.length && crypto.timingSafeEqual(providedBuf, expectedBuf);
        } catch {
            return false;
        }
    });
}

const route: WebhookHandler<GranolaWebhookPayload> = async (nango, headers, body, rawBody, query) => {
    const connectionIdentifierValue = query?.['nangoConnectionId'];

    if (!connectionIdentifierValue) {
        return Err(new NangoError('webhook_missing_connection_id'));
    }

    if (!headers['webhook-id'] || !headers['webhook-timestamp'] || !headers['webhook-signature']) {
        return Err(new NangoError('webhook_missing_signature'));
    }

    const connection = await nango.getConnectionForWebhook(connectionIdentifierValue);

    if (!connection) {
        return Err(new NangoError('webhook_invalid_secret', { reason: 'No webhook secret configured to validate this request' }));
    }

    const connectionSecret = connection.metadata?.['webhookSecret'];
    if (connectionSecret != null && typeof connectionSecret !== 'string') {
        return Err(new NangoError('webhook_invalid_secret', { reason: 'Invalid webhook secret' }));
    }

    if (!connectionSecret) {
        return Err(new NangoError('webhook_invalid_secret', { reason: 'No webhook secret configured to validate this request' }));
    }

    if (!validate(connectionSecret, headers['webhook-id'], headers['webhook-timestamp'], headers['webhook-signature'], rawBody)) {
        return Err(new NangoError('webhook_invalid_signature'));
    }

    const response = await nango.executeScriptForWebhooks({
        payload: body,
        webhookType: 'event_type',
        connectionIdentifierValue,
        propName: 'connectionId'
    });

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: response?.connectionIds || [],
        toForward: body
    });
};

export default route;
