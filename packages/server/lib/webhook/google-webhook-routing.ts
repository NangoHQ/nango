import { Err, Ok } from '@nangohq/utils';

import gmailWebhookRouting from './gmail-webhook-routing.js';
import { validateGoogleChannelToken, validateGooglePubSubPush } from './google-channel-token.js';

import type { WebhookHandler } from './types.js';

// Gmail pushes come via Pub/Sub (`{ message: { data } }`); Calendar pushes have an empty body.
function isPubSubPush(body: unknown): boolean {
    if (!body || typeof body !== 'object') {
        return false;
    }
    const message = (body as { message?: unknown }).message;
    return !!message && typeof message === 'object' && 'data' in message;
}

// Base `google` integration: Gmail and Calendar share one webhook URL.
const route: WebhookHandler = async (nango, headers, body, rawBody, query) => {
    if (nango.integration.provider === 'google' && isPubSubPush(body)) {
        const pushResult = validateGooglePubSubPush(nango, headers, query);
        if (pushResult.isErr()) {
            return Err(pushResult.error);
        }
        return gmailWebhookRouting(nango, headers, body, rawBody, query);
    }

    const tokenResult = validateGoogleChannelToken(nango, headers);
    if (tokenResult.isErr()) {
        return Err(tokenResult.error);
    }

    const resourceUri = headers['x-goog-resource-uri'];

    const baseArgs = {
        payload: headers,
        ...(headers['x-goog-resource-state'] && { webhookTypeValue: headers['x-goog-resource-state'] })
    };

    const response =
        typeof resourceUri === 'string'
            ? await nango.executeScriptForWebhooks({
                  ...baseArgs,
                  connectionIdentifierValue: resourceUri,
                  propName: 'metadata.googleCalendarWatchResourceUris'
              })
            : { connectionIds: [] as string[], connectionMetadata: {} };

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: response.connectionIds,
        toForward: headers
    });
};

export default route;
