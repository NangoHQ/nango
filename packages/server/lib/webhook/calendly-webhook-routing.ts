import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { isFreshTimestamp, validateHmacSignature } from './signature.js';

import type { WebhookHandler } from './types.js';

const SIGNATURE_TOLERANCE_SECONDS = 3 * 60;

function parseCalendlySignature(signatureHeader: string): { timestamp: string; signature: string } | null {
    const parts = signatureHeader.split(',');
    let timestamp = '';
    let signature = '';

    for (const part of parts) {
        const [key, value] = part.split('=');
        if (key === 't' && value) {
            timestamp = value;
        } else if (key === 'v1' && value) {
            signature = value;
        }
    }

    if (!timestamp || !signature) {
        return null;
    }

    return { timestamp, signature };
}

const route: WebhookHandler = async (nango, headers, body, rawBody) => {
    // https://developer.calendly.com/api-docs/4c305798a61d3-webhook-signatures
    const signatureHeader = headers['calendly-webhook-signature'];

    const webhookSecret = nango.integration.custom?.['webhookSecret'];

    if (webhookSecret) {
        if (!signatureHeader) {
            return Err(new NangoError('webhook_missing_signature'));
        }

        const parsedSignature = parseCalendlySignature(signatureHeader);
        if (!parsedSignature) {
            return Err(new NangoError('webhook_invalid_signature'));
        }

        const { timestamp, signature } = parsedSignature;

        if (!isFreshTimestamp(timestamp, SIGNATURE_TOLERANCE_SECONDS)) {
            return Err(new NangoError('webhook_invalid_signature'));
        }

        if (!validateHmacSignature({ secret: webhookSecret, rawBody, payload: `${timestamp}.${rawBody}`, signature })) {
            return Err(new NangoError('webhook_invalid_signature'));
        }
    } else {
        nango.markUnverified({ reason: 'calendly_missing_webhook_secret' });
    }

    const response = await nango.executeScriptForWebhooks({
        payload: body,
        webhookType: 'event',
        connectionIdentifier: 'created_by',
        propName: 'owner'
    });

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: response?.connectionIds || [],
        toForward: body
    });
};
export default route;
