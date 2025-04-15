import crypto from 'node:crypto';

import type { Config as ProviderConfig } from '@nangohq/shared';
import { getLogger } from '@nangohq/utils';
import type { WebhookHandler } from './types.js';
import type { LogContextGetter } from '@nangohq/logs';

const logger = getLogger('Webhook.Xero');

interface XeroWebhookBody {
    events: any[];
    lastEventSequence: number;
    firstEventSequence: number;
    entropy: string;
}

function validate(integration: ProviderConfig, headerSignature: string, rawBody: string): boolean {
    if (!integration.custom?.['webhookSecret']) {
        return false;
    }

    const signature = crypto.createHmac('sha256', integration.custom['webhookSecret']).update(rawBody).digest('base64');

    return signature === headerSignature;
}

const route: WebhookHandler = async (nango, integration, headers, body, rawBody, logContextGetter: LogContextGetter) => {
    const signature = headers['x-xero-signature'];
    if (!signature) {
        logger.error('Missing x-xero-signature header', { configId: integration.id });
        return { statusCode: 401 };
    }

    logger.info('Received Xero webhook', { configId: integration.id });

    if (!validate(integration, signature, rawBody)) {
        logger.error('Invalid signature', { configId: integration.id });
        return { statusCode: 401 };
    }

    const parsedBody = body as XeroWebhookBody;
    logger.info('Valid webhook received', { configId: integration.id });

    // For intent to receive validation, just return success
    if (parsedBody.events.length === 0) {
        return { statusCode: 200 };
    }

    let connectionIds: string[] = [];
    for (const event of parsedBody.events) {
        const response = await nango.executeScriptForWebhooks(integration, event, 'eventType', 'tenantId', logContextGetter, 'tenant_id');
        if (response && response.connectionIds?.length > 0) {
            connectionIds = connectionIds.concat(response.connectionIds);
        }
    }
    const response = { connectionIds };

    return { parsedBody, connectionIds: response?.connectionIds || [] };
};

export default route;
