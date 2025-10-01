import crypto from 'node:crypto';

import { NangoError } from '@nangohq/shared';
import { Err, Ok, getLogger, report } from '@nangohq/utils';

import type { WebhookHandler, jobdivaWebhookResponse } from './types.js';

const logger = getLogger('Webhook.JobDiva');

function validate(secret: string, headerSignature: string, rawBody: string): boolean {
    try {
        const signature = crypto.createHmac('sha1', secret).update(rawBody).digest('hex');
        const computedSignature = 'sha1=' + signature;
        return crypto.timingSafeEqual(Buffer.from(computedSignature), Buffer.from(headerSignature));
    } catch (err) {
        report(new Error('Validation error', { cause: err }));
        return false;
    }
}

const route: WebhookHandler<jobdivaWebhookResponse> = async (nango, headers, body, rawBody) => {
    const signature = headers['X-Hub-Signature'];

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

    const response = await nango.executeScriptForWebhooks({
        body,
        webhookType: `${body.type} ${body.operation}`
    });

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: response?.connectionIds || [],
        toForward: body
    });
};

export default route;
