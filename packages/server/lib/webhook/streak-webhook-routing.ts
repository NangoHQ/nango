import { connectionService, NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { safeCompare } from './signature.js';

import type { WebhookHandler } from './types.js';

// Streak includes X-Streak-Webhook-Token on every request if a token was set during webhook registration.
// The token is matched against connection_config.streakWebhookToken to identify the correct connection.
// https://streak.readme.io/reference/create-a-webhook
const route: WebhookHandler = async (nango, headers, body, _rawBody, query) => {
    const streakWebhookToken = headers['x-streak-webhook-token'];

    if (!streakWebhookToken) {
        return Err(new NangoError('webhook_missing_token'));
    }

    // With nangoConnectionId on the webhook URL the token is compared in constant time against that
    // one connection, instead of being looked up by SQL equality across all of them.
    const connectionId = query?.['nangoConnectionId'];
    if (connectionId) {
        const { response: connection } = await connectionService.getConnection(connectionId, nango.integration.unique_key, nango.environment.id);
        const expected = connection?.connection_config?.['streakWebhookToken'];

        if (typeof expected !== 'string' || !safeCompare(expected, streakWebhookToken)) {
            return Err(new NangoError('webhook_invalid_signature'));
        }

        const response = await nango.executeScriptForWebhooks({
            payload: body,
            connectionIdentifierValue: connectionId,
            propName: 'connectionId'
        });

        return Ok({
            content: { status: 'success' },
            statusCode: 200,
            connectionIds: response?.connectionIds || [],
            toForward: body
        });
    }

    const response = await nango.executeScriptForWebhooks({
        payload: body,
        connectionIdentifierValue: streakWebhookToken,
        propName: 'streakWebhookToken'
    });

    // The token is the only authentication, so a miss must not return the 200 that forwards the
    // body to the environment's webhook URLs.
    if (!response?.connectionIds.length) {
        return Ok({ content: null, statusCode: 204 });
    }

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: response?.connectionIds || [],
        toForward: body
    });
};

export default route;
