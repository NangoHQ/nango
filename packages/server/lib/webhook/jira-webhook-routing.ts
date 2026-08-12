import { createHmac, timingSafeEqual } from 'crypto';

import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import type { InternalNango } from './internal-nango.js';
import type { WebhookHandler } from './types.js';

function getOrigin(url: string): string | undefined {
    try {
        return new URL(url).origin;
    } catch {
        return undefined;
    }
}

function validate(secret: string, headerSignature: string, rawBody: string): boolean {
    const calculatedSignature = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;

    const calculatedBuffer = Buffer.from(calculatedSignature);
    const headerBuffer = Buffer.from(headerSignature);

    if (calculatedBuffer.length !== headerBuffer.length) {
        return false;
    }

    return timingSafeEqual(calculatedBuffer, headerBuffer);
}

function extractBaseUrl(body: Record<string, any> | null | undefined): string | undefined {
    if (!body) {
        return undefined;
    }
    const selfUrl =
        body['issue']?.['self'] ||
        body['comment']?.['self'] ||
        body['sprint']?.['self'] ||
        body['board']?.['self'] ||
        body['worklog']?.['self'] ||
        body['version']?.['self'] ||
        body['issueLink']?.['self'] ||
        body['project']?.['self'] ||
        body['attachment']?.['self'] ||
        body['issuetype']?.['self'] ||
        body['filter']?.['self'] ||
        body['user']?.['self'];
    if (!selfUrl) {
        return undefined;
    }
    return getOrigin(selfUrl);
}

async function routeEvent(nango: InternalNango, event: Record<string, any>): Promise<string[]> {
    const baseUrl = extractBaseUrl(event);
    if (!baseUrl) {
        return [];
    }
    const response = await nango.executeScriptForWebhooks({
        body: event,
        webhookType: 'webhookEvent',
        connectionIdentifierValue: baseUrl,
        propName: 'baseUrl'
    });
    return response?.connectionIds || [];
}

const route: WebhookHandler = async (nango, headers, body, rawBody) => {
    const secret = nango.integration.custom?.['webhookSecret'];
    if (secret) {
        const signature = headers['x-hub-signature'];
        if (!signature) {
            return Err(new NangoError('webhook_missing_signature'));
        }
        if (!validate(secret, signature, rawBody)) {
            return Err(new NangoError('webhook_invalid_signature'));
        }
    }

    const connectionIds = await routeEvent(nango, body);
    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds,
        toForward: body
    });
};

export default route;
