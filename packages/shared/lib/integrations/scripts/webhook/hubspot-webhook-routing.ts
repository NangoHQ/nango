import type { InternalNango as Nango } from './webhook.manager.js';
import type { Config as ProviderConfig } from '../../../models/Provider.js';
import crypto from 'crypto';

export function validate(integration: ProviderConfig, headers: Record<string, any>, body: any): boolean {
    const signature = headers['x-hubspot-signature'];

    const combinedSignature = `${integration.oauth_client_secret}${JSON.stringify(body)}`;
    const createdHash = crypto.createHash('sha256').update(combinedSignature).digest('hex');

    const bufferLength = Math.max(Buffer.from(signature, 'hex').length, Buffer.from(createdHash, 'hex').length);
    const signatureBuffer = Buffer.alloc(bufferLength, signature, 'hex');
    const hashBuffer = Buffer.alloc(bufferLength, createdHash, 'hex');

    return crypto.timingSafeEqual(signatureBuffer, hashBuffer);
}

export default async function route(nango: Nango, integration: ProviderConfig, headers: Record<string, any>, body: any) {
    const valid = validate(integration, headers, body);

    if (!valid) {
        console.log('Hubspot webhook signature invalid');
        return;
    }

    if (Array.isArray(body)) {
        const sorted = body.sort((a, b) => {
            return a.occurredAt - b.occurredAt;
        });
        for (const event of sorted) {
            await nango.executeScriptForWebhooks(integration, event, 'subscriptionType', 'portalId');
        }
    } else {
        await nango.executeScriptForWebhooks(integration, body, 'subscriptionType', 'portalId');
    }
}
