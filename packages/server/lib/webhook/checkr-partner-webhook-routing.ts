import { NangoError } from '@nangohq/shared';
import { Err, getLogger, Ok } from '@nangohq/utils';

import { validateHmacSignature } from './signature.js';

import type { WebhookHandler } from './types.js';

const logger = getLogger('Webhook.Checkr');

interface CheckrBody {
    id: string;
    object: string;
    type: string;
    created_at: string;
    webhook_url: string;
    data: Record<string, unknown>;
    createdAt: string;
}

const route: WebhookHandler<CheckrBody> = async (nango, headers, body, rawBody) => {
    const signature = headers['x-checkr-signature'];
    if (!signature) {
        logger.error('missing signature', { configId: nango.integration.id });
        return Err(new NangoError('webhook_missing_signature'));
    }

    const secret = nango.integration.custom?.['webhookSecret'];

    if (secret) {
        if (!validateHmacSignature({ secret, rawBody, signature })) {
            logger.error('invalid signature', { configId: nango.integration.id });
            return Err(new NangoError('webhook_invalid_signature'));
        }
    } else {
        nango.markUnverified({ reason: 'checkr_missing_webhook_secret', remediation: 'Set the Checkr webhook secret on the integration' });
    }

    const parsedBody = body;

    const response = await nango.executeScriptForWebhooks({
        payload: parsedBody,
        webhookType: 'type',
        connectionIdentifier: 'account_id',
        propName: 'checkr_account_id'
    });

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: response?.connectionIds || [],
        toForward: parsedBody
    });
};

export default route;
