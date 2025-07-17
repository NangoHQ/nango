import crypto from 'crypto';

import { NangoError } from '@nangohq/shared';
import { Err, Ok, getLogger } from '@nangohq/utils';

import type { FathomWeebhook, WebhookHandler } from './types.js';
import type { LogContextGetter } from '@nangohq/logs';

const logger = getLogger('Webhook.Attio');

function validate(secret: string, headerSignature: string, rawBody: string): boolean {
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    try {
        return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(headerSignature, 'utf8'));
    } catch {
        return false;
    }
}

const route: WebhookHandler<FathomWeebhook> = async (nango, integration, headers, body, rawBody, logContextGetter: LogContextGetter) => {
    const signature = headers['webhook-signature'];

    // Only validate signature if webhook secret is configured else just process without validating
    if (integration.custom?.['webhookSecret']) {
        if (!signature) {
            logger.error('missing signature', { configId: integration.id });
            return Err(new NangoError('webhook_missing_signature'));
        }

        if (!validate(integration.custom['webhookSecret'], signature, rawBody)) {
            logger.error('invalid signature', { configId: integration.id });
            return Err(new NangoError('webhook_invalid_signature'));
        }
    } else {
        logger.info('no webhook secret configured, skipping signature validation', { configId: integration.id });
    }

    logger.info('received', { configId: integration.id });

    const parsedBody = body;

    logger.info(`processing meeting: ${parsedBody.title}`, { configId: integration.id });
    const response = await nango.executeScriptForWebhooks(integration, parsedBody, 'meeting_type', 'recorded_by.email', logContextGetter, 'metadata.user');

    let connectionIds: string[] = [];
    if (response && response.connectionIds?.length > 0) {
        connectionIds = response.connectionIds;
    }

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: connectionIds,
        toForward: parsedBody
    });
};

export default route;
