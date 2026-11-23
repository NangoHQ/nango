import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { connectionsToRoute, NANGO_WEBHOOK_SECRET_HEADER, rejectUnverifiedWebhook, TELEGRAM_SECRET_TOKEN_HEADER } from './nango-webhook-secret.js';

import type { WebhookHandler } from './types.js';

/** An Update holds `update_id` and exactly one other field, named after its kind, e.g. `message`. https://core.telegram.org/bots/api#update */
export interface TelegramWebhookPayload {
    update_id: number;
    [kind: string]: unknown;
}

const MISSING_SECRET = { reason: 'telegram_missing_webhook_secret', remediation: 'Set webhookSecret in the connection metadata' };

// Telegram does not sign updates and they do not identify the bot. Each bot sets its own webhook with
// `setWebhook`, so the URL carries the connection id, and the `secret_token` passed to `setWebhook`, which
// Telegram sends back in `x-telegram-bot-api-secret-token`, is that connection's Nango webhook secret.
// https://core.telegram.org/bots/api#setwebhook
const route: WebhookHandler<TelegramWebhookPayload> = async (nango, headers, body, _rawBody, query) => {
    const connectionId = query?.['nangoConnectionId'];
    if (!connectionId) {
        return Err(new NangoError('webhook_missing_connection_id'));
    }

    // Only Telegram's own header counts, so the secret can't be sent another way.
    const { [NANGO_WEBHOOK_SECRET_HEADER]: _ignored, ...rest } = headers;
    const secretToken = headers[TELEGRAM_SECRET_TOKEN_HEADER];
    const presented = secretToken ? { ...rest, [NANGO_WEBHOOK_SECRET_HEADER]: secretToken } : rest;

    const connection = await nango.getConnectionForWebhook(connectionId);
    const routed = await connectionsToRoute({ nango, connections: connection ? [connection] : [], headers: presented, unverified: MISSING_SECRET });
    if (routed.length === 0) {
        return rejectUnverifiedWebhook(presented);
    }

    const kind = Object.keys(body).find((key) => key !== 'update_id');
    const response = await nango.executeScriptForWebhooks({
        payload: body,
        ...(kind ? { webhookTypeValue: kind } : {}),
        connectionIdentifierValue: connectionId,
        propName: 'connectionId'
    });

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: response?.connectionIds || [],
        toForward: body
    });
};

export default route;
