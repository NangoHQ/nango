import type { InternalNango as Nango } from './internal-nango.js';
import type { Config as ProviderConfig } from '../../../models/Provider.js';
import type { WebhookResponse } from './types.js';

export default async function route(
    nango: Nango,
    integration: ProviderConfig,
    headers: Record<string, any>,
    body: Record<string, any>
): Promise<WebhookResponse> {
    // slack sometimes sends the payload as a form encoded string, so we need to parse it
    // it also sends json as a x-www-form-urlencoded string, so we need to handle that too
    let payload;
    if (headers['content-type'] === 'application/x-www-form-urlencoded') {
        try {
            payload = JSON.parse(body['payload'] || body);
        } catch (e) {
            payload = body;
        }
    } else {
        payload = body;
    }

    if (payload['type'] === 'url_verification') {
        return { acknowledgementResponse: body['challenge'] };
    } else {
        await nango.executeScriptForWebhooks(integration, payload, 'type', 'team.id');

        return { parsedBody: payload };
    }
}
