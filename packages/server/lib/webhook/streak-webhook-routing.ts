import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import type { WebhookHandler } from './types.js';

// Streak includes X-Streak-Webhook-Token on every request if a token was set during webhook registration.
// The token is matched against connection_config.streakWebhookToken to identify the correct connection.
// https://streak.readme.io/reference/create-a-webhook
const route: WebhookHandler = async (nango, headers, body, _rawBody) => {
    const streakWebhookToken = headers['x-streak-webhook-token'];

    if (!streakWebhookToken) {
        return Err(new NangoError('webhook_missing_token'));
    }

    const response = await nango.executeScriptForWebhooks({
        body,
        connectionIdentifierValue: streakWebhookToken,
        propName: 'streakWebhookToken'
    });

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: response?.connectionIds || [],
        toForward: body
    });
};

export default route;
