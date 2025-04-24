import crypto from 'node:crypto';

import { getLogger } from '@nangohq/utils';

import type { WebhookHandler } from './types.js';
import type { LogContextGetter } from '@nangohq/logs';
import type { Config as ProviderConfig } from '@nangohq/shared';

const logger = getLogger('Webhook.Xero');

interface XeroWebhookBody {
    events: any[];
    lastEventSequence: number;
    firstEventSequence: number;
    entropy: string;
}

function validate(integration: ProviderConfig, signature: string, rawBody: string): boolean {
    const webhookKey = integration.custom?.['webhookSecret'];
    if (!webhookKey) {
        logger.error('Missing webhook key for signature validation', { configId: integration.id });
        return false;
    }

    try {
        // Create HMAC with the webhook key
        const hmac = crypto.createHmac('sha256', webhookKey);

        // Update with the raw body
        hmac.update(rawBody);

        // Get the base64 encoded signature
        const calculatedSignature = hmac.digest('base64');

        return calculatedSignature.replace(/\//g, '') === signature.replace(/\//g, '');
    } catch (err) {
        logger.error('Error validating signature', { configId: integration.id, err });
        return false;
    }
}

const route: WebhookHandler = async (nango, integration, headers, body, rawBody, logContextGetter: LogContextGetter) => {
    const signature = headers['x-xero-signature'];
    if (!signature) {
        logger.error('Missing x-xero-signature header', { configId: integration.id });
        return { statusCode: 401 };
    }

    logger.info('Received Xero webhook', { configId: integration.id });

    // "Intent to receive" validation request checks for proper response with valid and invalid payloads
    const isIntentToReceive = rawBody.includes('"events":[]');

    if (isIntentToReceive) {
        logger.info('Intent to receive validation detected', { configId: integration.id });

        // For "Intent to receive" validation, we need to validate the signature
        const isValidSignature = validate(integration, signature, rawBody);

        // Return 401 for incorrectly signed payloads, 200 for correctly signed payloads
        if (!isValidSignature) {
            logger.error('Invalid signature for Intent to receive validation', { configId: integration.id });
            return { statusCode: 401, acknowledgementResponse: { error: 'Invalid signature' } };
        }

        logger.info('Valid signature for Intent to receive validation', { configId: integration.id });
        return { statusCode: 200, acknowledgementResponse: { status: 'success' } };
    }

    const isValidSignature = validate(integration, signature, rawBody);

    if (!isValidSignature) {
        logger.error('Invalid signature', { configId: integration.id });
        return { statusCode: 401, acknowledgementResponse: { error: 'Invalid signature' } };
    }

    const parsedBody = body as XeroWebhookBody;
    logger.info('Valid webhook received', { configId: integration.id });

    if (parsedBody.events.length === 0) {
        logger.info('Empty events array, returning success', { configId: integration.id });
        return { statusCode: 200, acknowledgementResponse: { status: 'success' } };
    }

    let connectionIds: string[] = [];
    for (const event of parsedBody.events) {
        const response = await nango.executeScriptForWebhooks(integration, event, 'eventType', 'tenantId', logContextGetter, 'tenant_id');
        if (response && response.connectionIds?.length > 0) {
            connectionIds = connectionIds.concat(response.connectionIds);
        }
    }
    const response = { connectionIds };

    return {
        statusCode: 200,
        acknowledgementResponse: { status: 'success' },
        parsedBody,
        connectionIds: response?.connectionIds || []
    };
};

export default route;
