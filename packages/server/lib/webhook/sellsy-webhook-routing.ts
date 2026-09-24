import crypto from 'node:crypto';

import { NangoError } from '@nangohq/shared';
import { Err, getLogger, Ok } from '@nangohq/utils';

import { safeCompare } from './signature.js';

import type { SellsyWebhookPayload, WebhookHandler } from './types.js';

const logger = getLogger('Webhook.Sellsy');

// Sellsy hashes the concatenation rather than using HMAC, so this cannot reuse validateHmacSignature.
// https://help.sellsy.com/fr/articles/5876622-webhooks#h_d3e68dd04e
function validate(secret: string, headerSignature: string, rawBody: string): boolean {
    const signature = crypto
        .createHash('sha1')
        .update(secret + rawBody)
        .digest('hex');
    return safeCompare(signature, headerSignature, 'hex');
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
        nango.markUnverified({ reason: 'sellsy_missing_webhook_secret' });
    }

    let webhookTypeValue: string;
    if (body.eventType?.toLowerCase() === 'thirdlog') {
        if (body.thirdtype) {
            webhookTypeValue = `${body.thirdtype}.${body.event}`;
        } else {
            webhookTypeValue = `${body.relatedtype}.${body.eventType}.${body.event}`;
        }
    } else {
        webhookTypeValue = `${body.relatedtype}.${body.event}`;
    }

    const response = await nango.executeScriptForWebhooks({
        payload: body,
        webhookTypeValue,
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
