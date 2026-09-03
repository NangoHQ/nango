import crypto from 'node:crypto';

import { getFlags } from '@nangohq/feature-flags';
import { NangoError } from '@nangohq/shared';
import { Err, getLogger, Ok } from '@nangohq/utils';

import { envs } from '../env.js';

import type { AttioWebhook, WebhookHandler } from './types.js';

const logger = getLogger('Webhook.Attio');

function validate(secret: string, headerSignature: string, rawBody: string): boolean {
    const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(headerSignature));
}

function recordEventClass(eventType: string): 'fetch' | 'delete' | 'merged' | null {
    switch (eventType) {
        case 'record.created':
        case 'record.updated':
            return 'fetch';
        case 'record.deleted':
            return 'delete';
        case 'record.merged':
            return 'merged';
        default:
            return null;
    }
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

    const parsedBody = body;

    // For empty events we can just return success
    if (!parsedBody.events || parsedBody.events.length === 0) {
        logger.info('Empty events array', { configId: nango.integration.id });
        return Ok({ content: { status: 'success' }, statusCode: 200 });
    }

    const dedupeWindowMs = envs.NANGO_WEBHOOK_DEDUPE_WINDOW_MS;
    const enforceDedupe = dedupeWindowMs > 0 && (await getFlags().isAttioWebhookDedupeEnabled(nango.team.uuid));

    let connectionIds: string[] = [];
    for (const event of parsedBody.events) {
        const eventClass = recordEventClass(event.event_type);
        const dedupe =
            dedupeWindowMs > 0 && eventClass && event.id.record_id && event.id.object_id
                ? {
                      key: `attio:dedupe:${nango.environment.id}:${nango.integration.id}:${event.id.workspace_id}:${event.id.object_id}:${event.id.record_id}:${eventClass}`,
                      ttlMs: dedupeWindowMs,
                      enforce: enforceDedupe
                  }
                : undefined;
        const response = await nango.executeScriptForWebhooks({
            body: event,
            webhookType: 'event_type',
            connectionIdentifier: 'id.workspace_id',
            propName: 'workspace_id',
            ...(dedupe ? { dedupe } : {})
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
