import crypto from 'node:crypto';

import type { Config as ProviderConfig } from '../../../models/Provider.js';
import { getLogger } from '@nangohq/utils/dist/logger.js';
import type { WebhookHandler } from './types.js';

const logger = getLogger('Webhook.Linear');

interface LinearBody {
    action: string;
    data: Record<string, unknown>;
    type: string;
    createdAt: string;
}

function validate(integration: ProviderConfig, headerSignature: string, rawBody: string): boolean {
    if (!integration.custom?.['webhookSecret']) {
        return false;
    }

    const signature = crypto.createHmac('sha256', integration.custom['webhookSecret']).update(rawBody).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(headerSignature));
}

const route: WebhookHandler = async (nango, integration, headers, body, rawBody) => {
    const signature = headers['linear-signature'];

    logger.info('received', { configId: integration.id });

    if (!validate(integration, signature, rawBody)) {
        logger.error('invalid signature', { configId: integration.id });
        return;
    }

    const parsedBody = body as LinearBody;
    logger.info(`valid ${parsedBody.type}`, { configId: integration.id });

    const response = await nango.executeScriptForWebhooks(integration, parsedBody, 'type', 'organizationId', 'organizationId');

    return { parsedBody, connectionIds: response?.connectionIds || [] };
};

export default route;
