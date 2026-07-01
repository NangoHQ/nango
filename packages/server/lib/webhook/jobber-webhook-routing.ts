import crypto from 'node:crypto';

import { NangoError } from '@nangohq/shared';
import { Err, Ok, getLogger } from '@nangohq/utils';

import type { JobberWebhookPayload, WebhookHandler } from './types.js';

const logger = getLogger('Webhook.Jobber');

function validate(secret: string, headerSignature: string, rawBody: string): boolean {
    const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(headerSignature));
}

const route: WebhookHandler<JobberWebhookPayload> = async (nango, headers, body, rawBody) => {
    const signature = headers['x-jobber-hmac-sha256'];

    if (nango.integration.custom?.['webhookSecret']) {
        if (!signature) {
            logger.error('missing signature', { configId: nango.integration.id });
            return Err(new NangoError('webhook_missing_signature'));
        }

        if (!validate(nango.integration.custom['webhookSecret'], signature, rawBody)) {
            logger.error('invalid signature', { configId: nango.integration.id });
            return Err(new NangoError('webhook_invalid_signature'));
        }
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
