import { createHmac, timingSafeEqual } from 'crypto';

import { NangoError } from '@nangohq/shared';
import { Err, Ok, getLogger } from '@nangohq/utils';

import type { NotionWebhook, NotionWebhookVerification, WebhookHandler } from './types.js';

const logger = getLogger('Webhook.Notion');

function validate(verificationToken: string, headerSignature: string, body: string): boolean {
    const calculatedSignature = `sha256=${createHmac('sha256', verificationToken).update(body).digest('hex')}`;

    const calculatedBuffer = Buffer.from(calculatedSignature);
    const headerBuffer = Buffer.from(headerSignature);

    if (calculatedBuffer.length !== headerBuffer.length) {
        return false;
    }

    return timingSafeEqual(calculatedBuffer, headerBuffer);
}

const route: WebhookHandler<NotionWebhook | NotionWebhookVerification> = async (nango, headers, body, rawBody) => {
    const signature = headers['x-notion-signature'];
    const verificationToken = nango.integration.custom?.['webhookSecret'];

    if ('verification_token' in body) {
        logger.info('Received verification request, skipping signature validation', { configId: nango.integration.id });
    } else if (verificationToken) {
        if (!signature) {
            logger.error('missing signature', { configId: nango.integration.id });
            return Err(new NangoError('webhook_missing_signature'));
        }

        if (!validate(verificationToken, signature, rawBody)) {
            logger.error('invalid signature', { configId: nango.integration.id });
            return Err(new NangoError('webhook_invalid_signature'));
        }
    } else {
        logger.info('no verification token configured, skipping signature validation', { configId: nango.integration.id });
    }

    const response = await nango.executeScriptForWebhooks({
        body,
        webhookType: 'type',
        connectionIdentifier: 'workspace_id',
        propName: 'workspace_id'
    });

    const connectionIds = response?.connectionIds || [];

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds,
        toForward: body
    });
};

export default route;
