import crypto from 'node:crypto';

import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import type { JobberWebhookPayload, WebhookHandler } from './types.js';
import type { IntegrationConfig } from '@nangohq/types';

function validate(integration: IntegrationConfig, headerSignature: string | undefined, rawBody: string): boolean {
    const secret = integration.oauth_client_secret;
    if (!secret || !headerSignature) {
        return false;
    }

    const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');

    try {
        const digestBuf = Buffer.from(digest, 'base64');
        const signatureBuf = Buffer.from(headerSignature, 'base64');
        return digestBuf.length === signatureBuf.length && crypto.timingSafeEqual(digestBuf, signatureBuf);
    } catch {
        return false;
    }
}

const route: WebhookHandler<JobberWebhookPayload> = async (nango, headers, body, rawBody) => {
    const signature = headers['x-jobber-hmac-sha256'];

    if (!signature) {
        return Err(new NangoError('webhook_missing_signature'));
    }

    if (!validate(nango.integration, signature, rawBody)) {
        return Err(new NangoError('webhook_invalid_signature'));
    }

    const event = body?.data?.webHookEvent;
    if (!event) {
        return Ok({ content: { status: 'success' }, statusCode: 200 });
    }

    const response = await nango.executeScriptForWebhooks({
        body: event,
        webhookType: 'topic',
        connectionIdentifier: 'accountId',
        propName: 'accountId'
    });

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: response?.connectionIds ?? [],
        toForward: body
    });
};

export default route;
