import type { InternalNango as Nango } from './internal-nango.js';
import type { Config as ProviderConfig } from '../../../models/Provider.js';
import type { WebhookResponse } from './types.js';
import type { LogContextGetter } from '@nangohq/logs';

export default async function route(
    nango: Nango,
    integration: ProviderConfig,
    headers: Record<string, any>,
    body: Record<string, any>,
    logContextGetter: LogContextGetter
): Promise<WebhookResponse> {
    // slack sometimes sends the payload as a form encoded string, so we need to parse it
    // it also sends json as a x-www-form-urlencoded string, so we need to handle that too
    let payload;
    if (headers['content-type'] === 'application/x-www-form-urlencoded') {
        try {
            payload = JSON.parse(body['payload'] || body);
        } catch {
            payload = body;
        }
    } else {
        payload = body;
    }

    if (payload['type'] === 'url_verification') {
        return { acknowledgementResponse: body['challenge'] };
    } else {
        // the team.id is sometimes stored in the team_id field, and sometimes in the team.id field
        // so we need to check both
        const teamId = payload['team_id'] || payload['team']['id'];
        const response = await nango.executeScriptForWebhooks(integration, { ...payload, teamId }, 'type', 'teamId', logContextGetter, 'team.id');

        return { parsedBody: payload, connectionIds: response?.connectionIds || [] };
    }
}
