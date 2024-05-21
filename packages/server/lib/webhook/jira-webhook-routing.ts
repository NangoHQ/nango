import type { InternalNango as Nango } from './internal-nango.js';
import type { Config as ProviderConfig } from '@nangohq/shared';
import type { LogContextGetter } from '@nangohq/logs';

export default async function route(nango: Nango, integration: ProviderConfig, _headers: Record<string, any>, body: any, logContextGetter: LogContextGetter) {
    if (Array.isArray(body)) {
        let connectionIds: string[] = [];
        for (const event of body) {
            const response = await nango.executeScriptForWebhooks(
                integration,
                event,
                'payload.webhookEvent',
                'payload.user.accountId',
                logContextGetter,
                'accountId'
            );
            if (response && response.connectionIds?.length > 0) {
                connectionIds = connectionIds.concat(response.connectionIds);
            }
        }

        return connectionIds;
    } else {
        return nango.executeScriptForWebhooks(integration, body, 'payload.webhookEvent', 'payload.user.accountId', logContextGetter, 'accountId');
    }
}
