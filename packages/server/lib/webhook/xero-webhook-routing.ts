import crypto from 'node:crypto';

import type { Config as ProviderConfig } from '@nangohq/shared';
import type { WebhookHandler } from './types.js';
import type { LogContextGetter } from '@nangohq/logs';
import { getLogger } from '@nangohq/utils';

const logger = getLogger('Webhook.Xero');

interface XeroWebhookBody {
    events: any[];
    lastEventSequence: number;
    firstEventSequence: number;
    entropy: string;
}

function validate(integration: ProviderConfig, signature: string, rawBody: string): boolean {
    // Check for webhook key in the integration configuration
    const webhookKey = integration.custom?.['webhookKey'] || integration.custom?.['webhookSecret'];

    if (!webhookKey) {
        logger.error('Missing webhook key for signature validation', { configId: integration.id });
        return false;
    }
    console.log('webhookKey', webhookKey);
    console.log('signature', signature);
    console.log('rawBody', rawBody);

    try {
        // Create HMAC with the webhook key
        const hmac = crypto.createHmac('sha256', webhookKey);

        // Update with the raw body
        hmac.update(rawBody);

        // Get the base64 encoded signature
        const calculatedSignature = hmac.digest('base64');

        console.log('Calculated signature:', calculatedSignature);
        console.log('Received signature:', signature);
        console.log('Match:', calculatedSignature.replace(/\//g, '') === signature.replace(/\//g, ''));
        console.log('--------------------------------');

        // return calculatedSignature === signature;
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

    // Check if this is an "Intent to receive" validation request
    const isIntentToReceive = rawBody.includes('"events":[]');

    if (isIntentToReceive) {
        logger.info('Intent to receive validation detected', { configId: integration.id });

        // For "Intent to receive" validation, we need to validate the signature
        const isValidSignature = validate(integration, signature, rawBody);

        // Return 401 for incorrectly signed payloads, 200 for correctly signed payloads
        if (!isValidSignature) {
            logger.error('Invalid signature for Intent to receive validation', { configId: integration.id });
            return { statusCode: 401 };
        }

        logger.info('Valid signature for Intent to receive validation', { configId: integration.id });
        return { statusCode: 200 };
    }

    // For regular webhook events, validate the signature
    const isValidSignature = validate(integration, signature, rawBody);

    if (!isValidSignature) {
        logger.error('Invalid signature', { configId: integration.id });
        return { statusCode: 401 };
    }

    // For valid signatures, we return 200
    const parsedBody = body as XeroWebhookBody;
    logger.info('Valid webhook received', { configId: integration.id });

    // For empty events, just return success
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
