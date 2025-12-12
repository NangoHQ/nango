import crypto from 'node:crypto';

import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import type { WebhookHandler } from './types.js';

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

function validateCalendlySignature(webhookSecret: string, timestamp: string, headerSignature: string, rawBody: any): boolean {
    const data = timestamp + '.' + rawBody;
    const expectedSignature = crypto.createHmac('sha256', webhookSecret).update(data, 'utf8').digest('hex');

    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    const headerBuffer = Buffer.from(headerSignature, 'hex');

    if (expectedBuffer.length !== headerBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, headerBuffer);
}

function validateTimestamp(timestamp: string, toleranceMs: number = 180000): boolean {
    // 3 minutes tolerance by default
    const timestampMilliseconds = Number(timestamp) * 1000;
    const now = Date.now();
    return timestampMilliseconds >= now - toleranceMs && timestampMilliseconds <= now + toleranceMs;
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

        if (!validateTimestamp(timestamp)) {
            return Err(new NangoError('webhook_invalid_signature'));
        }

        if (!validateCalendlySignature(webhookSecret, timestamp, signature, rawBody)) {
            return Err(new NangoError('webhook_invalid_signature'));
        }
    }

    const response = await nango.executeScriptForWebhooks({
        body,
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
