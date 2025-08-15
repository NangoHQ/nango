import crypto from 'node:crypto';

import { NangoError } from '@nangohq/shared';
import { Err, Ok, getLogger } from '@nangohq/utils';

import type { WebhookHandler } from './types.js';
import type { IntegrationConfig } from '@nangohq/types';

const logger = getLogger('Webhook.Xero');

interface XeroWebhookBody {
    events: any[];
    lastEventSequence: number;
    firstEventSequence: number;
    entropy: string;
}

function validate(integration: IntegrationConfig, signature: string, rawBody: string): boolean {
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

const route: WebhookHandler<XeroWebhookBody> = async (nango, headers, body, rawBody) => {
    const signature = headers['x-xero-signature'];
    if (!signature) {
        logger.error('Missing x-xero-signature header', { configId: nango.integration.id });
        return Err(new NangoError('webhook_missing_signature'));
    }

    logger.info('Received Xero webhook', { configId: nango.integration.id });

    const isValidSignature = validate(nango.integration, signature, rawBody);
    if (!isValidSignature) {
        logger.error('Invalid signature', { configId: nango.integration.id });
        return Err(new NangoError('webhook_invalid_signature'));
    }

    const parsedBody = body;
    logger.info('Valid webhook received', { configId: nango.integration.id });

    // For empty events, just return success
    if (parsedBody.events.length === 0) {
        logger.info('Empty events array, returning success', { configId: nango.integration.id });
        return Ok({ content: { status: 'success' }, statusCode: 200 });
    }

    let connectionIds: string[] = [];
    for (const event of parsedBody.events) {
        const response = await nango.executeScriptForWebhooks({
            body: event,
            webhookType: 'eventType',
            connectionIdentifier: 'tenantId',
            propName: 'tenant_id'
        });
        if (response && response.connectionIds?.length > 0) {
            connectionIds = connectionIds.concat(response.connectionIds);
        }
    }

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds,
        toForward: parsedBody
    });
};

export default route;
