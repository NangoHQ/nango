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

    // TODO: sign with the raw msgTimestamp, already fixed NAN-6909
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

function verifySignature(secret: string, headers: Record<string, string>, rawBody: string | Buffer): 'valid' | 'missing' | 'invalid' {
    const msgId = headers['webhook-id'] || headers['svix-id'];
    const msgSignature = headers['webhook-signature'] || headers['svix-signature'];
    const msgTimestamp = headers['webhook-timestamp'] || headers['svix-timestamp'];

    if (!msgId || !msgSignature || !msgTimestamp) {
        return 'missing';
    }

    return validate(secret, msgId, msgSignature, msgTimestamp, rawBody) ? 'valid' : 'invalid';
}

/** Verifies against `secret` and maps a failure to the matching error, or returns null when valid. */
function verifyOrError(secret: string, headers: Record<string, string>, rawBody: string | Buffer): NangoError | null {
    const result = verifySignature(secret, headers, rawBody);
    if (result === 'valid') {
        return null;
    }
    return new NangoError(result === 'missing' ? 'webhook_missing_signature' : 'webhook_invalid_signature');
}

const route: WebhookHandler<FathomWebhookResponse> = async (nango, headers, body, rawBody, query) => {
    // Prefer the nangoConnectionId query param when the webhook URL was registered with one;
    // otherwise fall back to matching on the recording owner's email, as before.
    const nangoConnectionId = query?.['nangoConnectionId'];
    const emailAddress = body.recorded_by?.email;

    if (nangoConnectionId) {
        const connection = await nango.getConnectionForWebhook(nangoConnectionId);
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

        const error = verifyOrError(connectionSecret, headers, rawBody);
        if (error) {
            return Err(error);
        }
    } else {
        // TODO: NAN-6909 mark as unverified
        const integrationSecret = nango.integration.custom?.['webhookSecret'];
        if (integrationSecret) {
            const error = verifyOrError(integrationSecret, headers, rawBody);
            if (error) {
                return Err(error);
            }
        }
    }

    const response = await nango.executeScriptForWebhooks(
        nangoConnectionId
            ? {
                  payload: body,
                  connectionIdentifierValue: nangoConnectionId,
                  propName: 'connectionId'
              }
            : {
                  payload: body,
                  connectionIdentifierValue: emailAddress,
                  propName: 'metadata.emailAddress'
              }
    );

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: response?.connectionIds || [],
        toForward: body
    });
};

export default route;
