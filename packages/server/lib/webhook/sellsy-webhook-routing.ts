import crypto from 'node:crypto';

import { NangoError } from '@nangohq/shared';
import { Err, Ok, getLogger } from '@nangohq/utils';

import type { SellsyWebhookPayload, WebhookHandler } from './types.js';

const logger = getLogger('Webhook.Sellsy');

// https://help.sellsy.com/fr/articles/5876622-webhooks#h_d3e68dd04e
function validate(secret: string, headerSignature: string, rawBody: string): boolean {
    const signature = crypto
        .createHash('sha1')
        .update(secret + rawBody)
        .digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(headerSignature));
}

const route: WebhookHandler<SellsyWebhookPayload> = async (nango, headers, body, rawBody) => {
    const signature = headers['x-webhook-signature'];

    if (nango.integration.custom?.['webhookSecret']) {
        if (!signature) {
            logger.error('missing signature', { configId: nango.integration.id });
            return Err(new NangoError('webhook_missing_signature'));
        }

        if (!validate(nango.integration.custom['webhookSecret'], signature, rawBody)) {
            logger.error('invalid signature', { configId: nango.integration.id });
            return Err(new NangoError('webhook_invalid_signature'));
        }
    } else {
        logger.info('no webhook secret configured, skipping signature validation', { configId: nango.integration.id });
    }

    let webhookType: string;
    if (body.eventType?.toLowerCase() === 'thirdlog') {
        if (body.thirdtype) {
            webhookType = `${body.thirdtype}.${body.event}`;
        } else {
            webhookType = `${body.relatedtype}.${body.eventType}.${body.event}`;
        }
    } else {
        webhookType = `${body.relatedtype}.${body.event}`;
    }

    const response = await nango.executeScriptForWebhooks({
        body,
        webhookType,
        connectionIdentifier: 'corpid',
        propName: 'corpid'
    });

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: response?.connectionIds || [],
        toForward: body
    });
};

export default route;
