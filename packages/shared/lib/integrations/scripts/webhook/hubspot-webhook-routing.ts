import type { InternalNango as Nango } from './webhook.manager.js';
import type { Config as ProviderConfig } from '../../../models/Provider.js';
import crypto from 'crypto';

export function validate(integration: ProviderConfig, headers: Record<string, any>, body: any): boolean {
    const signature = headers['x-hubspot-signature'];

    const combinedSignature = `${integration.oauth_client_secret}${JSON.stringify(body)}`;
    const createdHash = crypto.createHash('sha256').update(combinedSignature).digest('hex');

    return signature === createdHash;
}

export default async function route(nango: Nango, integration: ProviderConfig, headers: Record<string, any>, body: any) {
    const valid = validate(integration, headers, body);

    if (!valid) {
        console.log('Hubspot webhook signature invalid');
        return;
    }

    if (Array.isArray(body)) {
        for (const event of body) {
            await nango.executeScriptForWebhooks(integration, event, 'subscriptionType', 'portalId');
        }
    } else {
        await nango.executeScriptForWebhooks(integration, body, 'subscriptionType', 'portalId');
    }
}
