import type { InternalNango as Nango } from './internal-nango.js';
import type { Config as ProviderConfig } from '../../../models/Provider.js';

export default async function route(nango: Nango, integration: ProviderConfig, _headers: Record<string, any>, body: any) {
    if (Array.isArray(body)) {
        let connectionIds: string[] = [];
        for (const event of body) {
            const response = await nango.executeScriptForWebhooks(integration, event, 'payload.webhookEvent', 'payload.user.accountId', 'accountId');
            if (response && response.connectionIds?.length > 0) {
                connectionIds = connectionIds.concat(response.connectionIds);
            }
        }

        return connectionIds;
    } else {
        return await nango.executeScriptForWebhooks(integration, body, 'payload.webhookEvent', 'payload.user.accountId', 'accountId');
    }
}
