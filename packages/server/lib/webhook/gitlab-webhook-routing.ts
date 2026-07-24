import crypto from 'node:crypto';

import { NangoError } from '@nangohq/shared';
import { Err, getLogger, Ok } from '@nangohq/utils';

import type { WebhookHandler } from './types.js';

const logger = getLogger('Webhook.Gitlab');
const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

function safeCompare(expected: string, received: string): boolean {
    const expectedBuffer = Buffer.from(expected);
    const receivedBuffer = Buffer.from(received);

    return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

function validateSigningToken(secret: string, headers: Record<string, string>, rawBody: string): boolean {
    const webhookId = headers['webhook-id'];
    const webhookTimestamp = headers['webhook-timestamp'];
    const webhookSignature = headers['webhook-signature'];

    if (!webhookId || !webhookTimestamp || !webhookSignature || !secret.startsWith('whsec_')) {
        return false;
    }

    const timestamp = Number(webhookTimestamp);
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isSafeInteger(timestamp) || Math.abs(now - timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
        return false;
    }

    const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
    if (key.length !== 32) {
        return false;
    }

    const payload = `${webhookId}.${webhookTimestamp}.${rawBody}`;
    const expectedSignature = `v1,${crypto.createHmac('sha256', key).update(payload).digest('base64')}`;

    return webhookSignature.split(' ').some((signature) => safeCompare(expectedSignature, signature));
}

function getBodyConnectionId(body: unknown): string | undefined {
    if (!body || typeof body !== 'object' || !('nangoConnectionId' in body)) {
        return undefined;
    }

    const connectionId = body.nangoConnectionId;
    return typeof connectionId === 'string' ? connectionId : undefined;
}

const route: WebhookHandler = async (nango, headers, body, rawBody, query) => {
    // GitLab payloads carry no Nango connection id, so route by the nangoConnectionId query param on the webhook URL.
    const connectionIdentifierValue = query?.['nangoConnectionId'] ?? getBodyConnectionId(body);

    if (!connectionIdentifierValue) {
        return Err(new NangoError('webhook_missing_connection_id'));
    }

    const connection = await nango.getConnectionForWebhook(connectionIdentifierValue);
    if (!connection) {
        return Ok({
            content: { status: 'success' },
            statusCode: 200,
            connectionIds: [],
            toForward: body
        });
    }

    const webhookSecret = connection.metadata?.['webhookSecret'];
    if (webhookSecret != null && typeof webhookSecret !== 'string') {
        return Err(new NangoError('webhook_invalid_secret', { reason: 'Invalid webhook secret' }));
    }

    if (webhookSecret) {
        const signature = headers['webhook-signature'];
        const legacyToken = headers['x-gitlab-token'];
        const valid = signature ? validateSigningToken(webhookSecret, headers, rawBody) : Boolean(legacyToken && safeCompare(webhookSecret, legacyToken));

        if (!valid) {
            logger.error('invalid signature', { configId: nango.integration.id, connectionId: connection.connectionId });
            return Err(new NangoError(signature || legacyToken ? 'webhook_invalid_signature' : 'webhook_missing_signature'));
        }
    }

    const response = await nango.executeScriptForWebhooks({
        body,
        webhookHeaderValue: headers['x-gitlab-event'] as string,
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
