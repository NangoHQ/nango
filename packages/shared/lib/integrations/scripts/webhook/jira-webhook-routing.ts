import type { InternalNango as Nango } from './webhook.manager.js';
import type { Config as ProviderConfig } from '../../../models/Provider.js';

export default async function route(nango: Nango, integration: ProviderConfig, _headers: Record<string, any>, body: any) {
    if (Array.isArray(body)) {
        for (const event of body) {
            await nango.executeScriptForWebhooks(integration, event, 'payload.webhookEvent', 'payload.user.accountId', 'accountId');
        }
    } else {
        await nango.executeScriptForWebhooks(integration, body, 'payload.webhookEvent', 'payload.user.accountId', 'accountId');
    }
}
