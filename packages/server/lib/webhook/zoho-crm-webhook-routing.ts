import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { MIN_SECRET_LENGTH } from './nango-webhook-secret.js';
import { safeCompare } from './signature.js';

import type { WebhookHandler, ZohoCrmWebhookPayload } from './types.js';

// Zoho CRM Notification API: a channel is enabled per connection with POST /crm/v8/actions/watch, and Zoho
// POSTs a JSON body (module, ids, operation, channel_id, token) to its notify_url. There is no signature:
// the `token` chosen when enabling the channel is echoed in every body to prove the call came from Zoho.
// https://www.zoho.com/crm/developer/docs/api/v8/notifications/enable.html
// The payload carries no org identifier, so each channel is registered with `?nangoConnectionId=` in its
// notify_url and its token is verified against the secret stored on that connection.
const route: WebhookHandler<ZohoCrmWebhookPayload> = async (nango, _headers, body, _rawBody, query) => {
    const nangoConnectionId = query?.['nangoConnectionId'];
    if (!nangoConnectionId) {
        return Err(new NangoError('webhook_missing_connection_id'));
    }

    // An unknown connection, one without a secret (or one too short to be safe), a missing token and a wrong
    // token all return the same error, so the endpoint can't be used to check which connection ids exist.
    // The token is chosen by the customer, so a short one would be guessable from the public webhook URL.
    const connection = await nango.getConnectionForWebhook(nangoConnectionId);
    // TODO: NAN-6927 move off metadata
    const secret = connection?.metadata?.['webhookSecret'];
    const token = body?.token;
    if (typeof secret !== 'string' || secret.length < MIN_SECRET_LENGTH || typeof token !== 'string' || !token || !safeCompare(secret, token)) {
        return Err(new NangoError('webhook_invalid_signature'));
    }

    const response = await nango.executeScriptForWebhooks({
        payload: body,
        ...(body.module && body.operation && { webhookTypeValue: `${body.module}.${body.operation}` }),
        connectionIdentifierValue: nangoConnectionId,
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
