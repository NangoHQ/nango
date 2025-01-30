import crypto from 'node:crypto';

import type { Config as ProviderConfig } from '@nangohq/shared';
import { getLogger } from '@nangohq/utils';
import type { WebhookHandler } from './types.js';
import type { LogContextGetter } from '@nangohq/logs';

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

function validate(integration: ProviderConfig, headerSignature: string, rawBody: string): boolean {
    if (!integration.custom?.['webhookSecret']) {
        return false;
    }

    const signature = crypto.createHmac('sha256', integration.custom['webhookSecret']).update(rawBody).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(headerSignature));
}

const route: WebhookHandler = async (nango, integration, headers, body, rawBody, logContextGetter: LogContextGetter) => {
    const signature = headers['x-checkr-signature'];
    if (!signature) {
        logger.error('missing signature', { configId: integration.id });
        return;
    }

    logger.info('received', { configId: integration.id });

    if (!validate(integration, signature, rawBody)) {
        logger.error('invalid signature', { configId: integration.id });
        // TODO the verification should use the API key
        //return;
    }

    const parsedBody = body as CheckrBody;
    logger.info(`valid ${parsedBody.type}`, { configId: integration.id });

    const response = await nango.executeScriptForWebhooks(integration, parsedBody, 'type', 'account_id', logContextGetter, 'checkr_account_id');

    return { parsedBody, connectionIds: response?.connectionIds || [] };
};

export default route;
