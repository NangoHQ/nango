import crypto from 'node:crypto';

import { NangoError } from '@nangohq/shared';
import { Err, Ok, getLogger } from '@nangohq/utils';

import type { AttioWebhook, WebhookHandler } from './types.js';

const logger = getLogger('Webhook.Attio');

function validate(secret: string, headerSignature: string, rawBody: string): boolean {
    const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(headerSignature));
}

const route: WebhookHandler<AttioWebhook> = async (nango, headers, body, rawBody) => {
    const signature = headers['x-attio-signature'];

    // Only validate signature if webhook secret is configured else just process without validating
    if (nango.integration.custom?.['webhookSecret']) {
        if (!signature) {
            logger.error('missing signature', { configId: nango.integration.id });
            return Err(new NangoError('webhook_missing_signature'));
        }

        if (!validate(nango.integration.custom['webhookSecret'], signature, rawBody)) {
            logger.error('invalid signature', { configId: nango.integration.id });
            return Err(new NangoError('webhook_invalid_signature'));
        }
    } else {
        logger.info('no webhook secret configured, skipping signature validation', { configId: nango.integration.id });
    }

    logger.info('received', { configId: nango.integration.id });

    const parsedBody = body;

    // For empty events we can just return success
    if (!parsedBody.events || parsedBody.events.length === 0) {
        logger.info('Empty events array', { configId: nango.integration.id });
        return Ok({ content: { status: 'success' }, statusCode: 200 });
    }

    let connectionIds: string[] = [];
    for (const event of parsedBody.events) {
        logger.info(`processing event ${event.event_type}`, { configId: nango.integration.id });
        const response = await nango.executeScriptForWebhooks({
            body: event,
            webhookType: 'event_type',
            connectionIdentifier: 'id.workspace_id',
            propName: 'workspace_id'
        });
        if (response && response.connectionIds?.length > 0) {
            connectionIds = connectionIds.concat(response.connectionIds);
        }
    }

    // Deduplicate connection IDs to prevent multiple webhook forwards for the same connection
    const uniqueConnectionIds = Array.from(new Set(connectionIds));

    if (uniqueConnectionIds.length !== connectionIds.length) {
        logger.info(`Deduplicated connection IDs: ${connectionIds.length} -> ${uniqueConnectionIds.length}`, {
            configId: nango.integration.id,
            originalCount: connectionIds.length,
            uniqueCount: uniqueConnectionIds.length
        });
    }
    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: uniqueConnectionIds,
        toForward: parsedBody
    });
};

export default route;
