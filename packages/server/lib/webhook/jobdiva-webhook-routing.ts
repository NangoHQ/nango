import { NangoError } from '@nangohq/shared';
import { Err, getLogger, Ok } from '@nangohq/utils';

import { validateHmacSignature } from './signature.js';

import type { jobdivaWebhookResponse, WebhookHandler } from './types.js';

const logger = getLogger('Webhook.JobDiva');

const route: WebhookHandler<jobdivaWebhookResponse> = async (nango, headers, body, rawBody) => {
    const signature = headers['x-hub-signature'];

    if (nango.integration.custom?.['webhookSecret']) {
        if (!signature) {
            logger.error('missing signature', { configId: nango.integration.id });
            return Err(new NangoError('webhook_missing_signature'));
        }

        if (!validateHmacSignature({ secret: nango.integration.custom['webhookSecret'], rawBody, signature, algorithm: 'sha1', prefix: 'sha1=' })) {
            logger.error('invalid signature', { configId: nango.integration.id });
            return Err(new NangoError('webhook_invalid_signature'));
        }
    } else {
        nango.markUnverified({ reason: 'jobdiva_missing_webhook_secret' });
    }

    const response = await nango.executeScriptForWebhooks({
        payload: body,
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
