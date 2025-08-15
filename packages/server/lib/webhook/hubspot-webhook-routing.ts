import crypto from 'node:crypto';

import { NangoError } from '@nangohq/shared';
import { Err, Ok, getLogger } from '@nangohq/utils';

import type { WebhookHandler } from './types.js';
import type { IntegrationConfig } from '@nangohq/types';

const logger = getLogger('Webhook.Hubspot');

export function validate(integration: IntegrationConfig, headers: Record<string, any>, body: any): boolean {
    const signature = headers['x-hubspot-signature'];

    const combinedSignature = `${integration.oauth_client_secret}${JSON.stringify(body)}`;
    const createdHash = crypto.createHash('sha256').update(combinedSignature).digest('hex');

    const bufferLength = Math.max(Buffer.from(signature, 'hex').length, Buffer.from(createdHash, 'hex').length);
    const signatureBuffer = Buffer.alloc(bufferLength, signature, 'hex');
    const hashBuffer = Buffer.alloc(bufferLength, createdHash, 'hex');

    return crypto.timingSafeEqual(signatureBuffer, hashBuffer);
}

const route: WebhookHandler = async (nango, headers, body) => {
    const valid = validate(nango.integration, headers, body);

    if (!valid) {
        logger.error('webhook signature invalid');
        return Err(new NangoError('webhook_invalid_signature'));
    }

    if (Array.isArray(body)) {
        const groupedByObjectId = body.reduce((acc, event) => {
            (acc[event.objectId] = acc[event.objectId] || []).push(event);
            return acc;
        }, {});

        let connectionIds: string[] = [];

        for (const objectId in groupedByObjectId) {
            const sorted = groupedByObjectId[objectId].sort((a: any, b: any) => {
                const aIsCreation = a.subscriptionType.endsWith('.creation') ? 1 : 0;
                const bIsCreation = b.subscriptionType.endsWith('.creation') ? 1 : 0;
                return bIsCreation - aIsCreation || a.occurredAt - b.occurredAt;
            });

            for (const event of sorted) {
                const response = await nango.executeScriptForWebhooks({
                    body: event,
                    webhookType: 'subscriptionType',
                    connectionIdentifier: 'portalId'
                });
                if (response && response.connectionIds?.length > 0) {
                    connectionIds = connectionIds.concat(response.connectionIds);
                }
            }
        }

        return Ok({ content: { status: 'success' }, statusCode: 200, connectionIds });
    } else {
        const response = await nango.executeScriptForWebhooks({
            body,
            webhookType: 'subscriptionType',
            connectionIdentifier: 'portalId'
        });
        return Ok({
            content: { status: 'success' },
            statusCode: 200,
            connectionIds: response?.connectionIds || [],
            toForward: body
        });
    }
};

export default route;
