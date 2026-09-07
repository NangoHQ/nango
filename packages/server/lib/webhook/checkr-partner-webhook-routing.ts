import crypto from 'node:crypto';

import { NangoError } from '@nangohq/shared';
import { Err, getLogger, Ok } from '@nangohq/utils';

import type { WebhookHandler } from './types.js';
import type { IntegrationConfig } from '@nangohq/types';

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

function validate(integration: IntegrationConfig, headerSignature: string, rawBody: string): boolean {
    if (!integration.custom?.['webhookSecret']) {
        return false;
    }

    const signature = crypto.createHmac('sha256', integration.custom['webhookSecret']).update(rawBody).digest('hex');
    const trusted = Buffer.from(signature, 'utf8');
    const untrusted = Buffer.from(headerSignature, 'utf8');
    return trusted.length === untrusted.length && crypto.timingSafeEqual(trusted, untrusted);
}

const route: WebhookHandler<CheckrBody> = async (nango, headers, body, rawBody) => {
    const signature = headers['x-checkr-signature'];
    if (!signature) {
        logger.error('missing signature', { configId: nango.integration.id });
        return Err(new NangoError('webhook_missing_signature'));
    }

    if (!validate(nango.integration, signature, rawBody)) {
        logger.error('invalid signature', { configId: nango.integration.id });
        return Err(new NangoError('webhook_invalid_signature'));
    }

    const parsedBody = body;

    const response = await nango.executeScriptForWebhooks({
        body: parsedBody,
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
