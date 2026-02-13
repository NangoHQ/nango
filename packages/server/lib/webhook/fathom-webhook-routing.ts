import crypto from 'node:crypto';

import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import type { FathomWebhookResponse, WebhookHandler } from './types.js';

// https://developers.fathom.ai/webhooks#verifying-webhooks
// built from the Fathom sdk
function validate(secret: string, msgId: string, msgSignature: string, msgTimestamp: string, rawBody: string | Buffer): boolean {
    let actualSecret: Buffer;
    if (secret.startsWith('whsec_')) {
        actualSecret = Buffer.from(secret.substring(6), 'base64');
    } else {
        actualSecret = Buffer.from(secret, 'base64');
    }

    const now = Math.floor(Date.now() / 1000);
    const timestamp = parseInt(msgTimestamp, 10);
    const tolerance = 5 * 60;

    if (isNaN(timestamp) || now - timestamp > tolerance || timestamp > now + tolerance) {
        return false;
    }

    const payloadString = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;

    const timestampNumber = Math.floor(timestamp);
    const toSign = `${msgId}.${timestampNumber}.${payloadString}`;

    const expected = crypto.createHmac('sha256', actualSecret).update(toSign, 'utf8').digest('base64');

    const passedSignatures = msgSignature.split(' ');

    for (const versionedSignature of passedSignatures) {
        const [_version, signature] = versionedSignature.split(',');

        if (!signature) {
            return false;
        }

        if (crypto.timingSafeEqual(Buffer.from(signature, 'base64'), Buffer.from(expected, 'base64'))) {
            return true;
        }
    }

    return false;
}

const route: WebhookHandler<FathomWebhookResponse> = async (nango, headers, body, rawBody) => {
    if (nango.integration.custom?.['webhookSecret']) {
        const msgId = headers['webhook-id'] || headers['svix-id'];
        const msgSignature = headers['webhook-signature'] || headers['svix-signature'];
        const msgTimestamp = headers['webhook-timestamp'] || headers['svix-timestamp'];

        if (!msgId || !msgSignature || !msgTimestamp) {
            return Err(new NangoError('webhook_missing_signature'));
        }

        if (!validate(nango.integration.custom['webhookSecret'], msgId, msgSignature, msgTimestamp, rawBody)) {
            return Err(new NangoError('webhook_invalid_signature'));
        }
    }

    const emailAddress = body.recorded_by?.email;

    const response = await nango.executeScriptForWebhooks({
        body,
        connectionIdentifierValue: emailAddress,
        propName: 'metadata.emailAddress'
    });

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: response?.connectionIds || [],
        toForward: body
    });
};

export default route;
