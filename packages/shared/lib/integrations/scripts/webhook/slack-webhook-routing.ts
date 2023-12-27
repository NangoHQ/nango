import type { InternalNango as Nango, WebhookResponse } from './webhook.manager.js';
import type { Config as ProviderConfig } from '../../../models/Provider.js';

export default async function route(
    nango: Nango,
    integration: ProviderConfig,
    _headers: Record<string, any>,
    body: Record<string, any>
): Promise<WebhookResponse> {
    // slack sends the payload as a form encoded string, so we need to parse it
    const payload = JSON.parse(body['payload']);

    if (payload['type'] === 'url_verification') {
        return { acknowledgementResponse: body['challenge'] };
    } else {
        await nango.executeScriptForWebhooks(integration, payload, 'type', 'team.id');

        return { parsedBody: payload };
    }
}
