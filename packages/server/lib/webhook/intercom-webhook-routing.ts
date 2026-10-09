import { NangoError } from '@nangohq/shared';
import { Err, getLogger, Ok } from '@nangohq/utils';

import { validateHmacSignature } from './signature.js';

import type { WebhookHandler } from './types.js';

const logger = getLogger('Webhook.Intercom');

interface IntercomWebhook {
    type: string;
    id: string;
    topic: string;
    app_id: string;
    data: { item: Record<string, unknown> };
}

/**
 * Intercom signs notifications with HMAC-SHA1 of the raw body, keyed with the app's client secret,
 * sent as `X-Hub-Signature: sha1=<hex>`.
 * https://developers.intercom.com/docs/references/2.15/webhooks/webhook-models
 */
const route: WebhookHandler<IntercomWebhook> = async (nango, headers, body, rawBody) => {
    const secret = nango.integration.oauth_client_secret;
    if (!secret) {
        logger.error('missing client secret', { configId: nango.integration.id });
        return Err(new NangoError('webhook_invalid_secret', { reason: 'No client secret configured' }));
    }

    const signature = headers['x-hub-signature'];
    if (!signature) {
        logger.error('missing signature', { configId: nango.integration.id });
        return Err(new NangoError('webhook_missing_signature'));
    }

    if (!validateHmacSignature({ secret, rawBody, signature, algorithm: 'sha1', prefix: 'sha1=' })) {
        logger.error('invalid signature', { configId: nango.integration.id });
        return Err(new NangoError('webhook_invalid_signature'));
    }

    const response = await nango.executeScriptForWebhooks({
        payload: body,
        webhookType: 'topic',
        connectionIdentifier: 'app_id',
        propName: 'appId'
    });

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: response?.connectionIds || [],
        toForward: body
    });
};

export default route;
