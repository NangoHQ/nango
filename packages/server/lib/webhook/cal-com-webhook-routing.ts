import crypto from 'node:crypto';

import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import type { WebhookHandler } from './types.js';

function validateCalComSignature(secret: string, headerSignature: string, rawBody: string): boolean {
    const signature = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');

    const expectedBuffer = Buffer.from(signature, 'hex');
    const receivedBuffer = Buffer.from(headerSignature, 'hex');

    if (expectedBuffer.length !== receivedBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

const route: WebhookHandler = async (nango, headers, body, rawBody) => {
    // https://cal.com/docs/developing/guides/automation/webhooks#verifying-the-authenticity-of-the-received-payload
    const signatureHeader = headers['x-cal-signature-256'];
    const webhookSecret = nango.integration.custom?.['webhookSecret'];

    if (webhookSecret) {
        if (!signatureHeader) {
            return Err(new NangoError('webhook_missing_signature'));
        }

        if (!validateCalComSignature(webhookSecret, signatureHeader, rawBody)) {
            return Err(new NangoError('webhook_invalid_signature'));
        }
    }

    const connectionIdentifierValue = body.nangoConnectionId;

    if (!connectionIdentifierValue) {
        return Err(new NangoError('webhook_missing_connection_id'));
    }

    const response = await nango.executeScriptForWebhooks({
        body,
        webhookType: 'triggerEvent',
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
