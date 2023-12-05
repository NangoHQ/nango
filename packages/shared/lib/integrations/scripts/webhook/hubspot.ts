import type { InternalNango as Nango } from './webhook.manager.js';
import type { Config as ProviderConfig } from '../../../models/Provider.js';
import crypto from 'crypto';

export function validate(integration: ProviderConfig, headers: Record<string, any>, body: any): boolean {
    const signature = headers['X-HubSpot-Signature'];

    const combinedSignature = `${integration.oauth_client_secret}${body}`;
    const createdHash = crypto.createHash('sha256').update(combinedSignature).digest('hex');

    return signature === createdHash;
}

export default async function route(nango: Nango, integration: ProviderConfig, headers: Record<string, any>, body: any) {
    const valid = validate(integration, headers, body);

    if (!valid) {
        console.log(valid);
        //return;
    }

    await nango.executeScriptForWebhooks(integration, body, 'subscriptionType');
    //const syncConfigsWithWebhooks = await nango.getWebhooks(integration.environment_id, integration.id as number);

    //for (const webhook of webhooks) {
    //const { file_location, name } = webhook;

    //if (event === 'contact.creation') {
    //await nango.triggerWebhookSync()
    //}
    //}
}
