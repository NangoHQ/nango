import type { InternalNango as Nango } from './webhook.manager.js';
import type { Config as ProviderConfig } from '../../../models/Provider.js';

export default async function route(nango: Nango, integration: ProviderConfig, headers: Record<string, any>, body: Record<string, any>): Promise<void | any> {
    console.log('Slack webhook received');
    console.log('Headers', headers);
    console.log('Body ', body);

    if (body['type'] === 'url_verification') {
        return body['challenge'];
    } else {
        await nango.executeScriptForWebhooks(integration, body, 'type', 'payload.team.id', 'team.id');
    }
}
