import crypto from 'node:crypto';

import { WebhookRoutingError } from '@nangohq/shared';
import { getLogger } from '@nangohq/utils';

import type { WebhookHandler } from './types.js';
import type { LogContextGetter } from '@nangohq/logs';
import type { Config as ProviderConfig } from '@nangohq/shared';

const logger = getLogger('Webhook.Hubspot');

export function validate(integration: ProviderConfig, headers: Record<string, any>, body: any): boolean {
    const signature = headers['x-hubspot-signature'];

    const combinedSignature = `${integration.oauth_client_secret}${JSON.stringify(body)}`;
    const createdHash = crypto.createHash('sha256').update(combinedSignature).digest('hex');

    const bufferLength = Math.max(Buffer.from(signature, 'hex').length, Buffer.from(createdHash, 'hex').length);
    const signatureBuffer = Buffer.alloc(bufferLength, signature, 'hex');
    const hashBuffer = Buffer.alloc(bufferLength, createdHash, 'hex');

    return crypto.timingSafeEqual(signatureBuffer, hashBuffer);
}

const route: WebhookHandler = async (nango, integration, headers, body, _rawBody, logContextGetter: LogContextGetter) => {
    const valid = validate(integration, headers, body);

    if (!valid) {
        logger.error('webhook signature invalid');
        throw new WebhookRoutingError('invalid_signature');
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
                const response = await nango.executeScriptForWebhooks(integration, event, 'subscriptionType', 'portalId', logContextGetter);
                if (response && response.connectionIds?.length > 0) {
                    connectionIds = connectionIds.concat(response.connectionIds);
                }
            }
        }

        return { response: { status: 'success' }, statusCode: 200, connectionIds };
    } else {
        const response = await nango.executeScriptForWebhooks(integration, body, 'subscriptionType', 'portalId', logContextGetter);
        return {
            response: { status: 'success' },
            statusCode: 200,
            connectionIds: response?.connectionIds || [],
            toForward: body
        };
    }
};

export default route;
