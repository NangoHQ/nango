import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { safeCompare } from './signature.js';

import type { WebhookHandler } from './types.js';

// The query parameter selects the connection; Basic authentication uses the fixed
// username "nango" and that connection's metadata.webhookSecret as the password.
const route: WebhookHandler<Record<string, unknown>> = async (nango, headers, body, _rawBody, query) => {
    const connectionIdentifierValue = query?.['nangoConnectionId'];
    if (!connectionIdentifierValue) {
        return Err(new NangoError('webhook_missing_connection_id'));
    }

    const authorization = /^Basic ([A-Za-z0-9+/]+=*)$/i.exec(headers['authorization'] ?? '')?.[1];
    if (!authorization) {
        return Err(new NangoError('webhook_missing_token'));
    }

    const credentials = Buffer.from(authorization, 'base64').toString('utf8');
    const separator = credentials.indexOf(':');
    if (separator <= 0 || credentials.slice(0, separator) !== 'nango') {
        return Err(new NangoError('webhook_invalid_signature'));
    }

    const connection = await nango.getConnectionForWebhook(connectionIdentifierValue);
    const secret = connection?.metadata?.['webhookSecret'];
    if (typeof secret !== 'string' || !secret || !safeCompare(secret, credentials.slice(separator + 1))) {
        return Err(new NangoError('webhook_invalid_signature'));
    }

    const response = await nango.executeScriptForWebhooks({
        payload: body,
        connectionIdentifierValue,
        propName: 'connectionId'
    });

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: response.connectionIds,
        toForward: body
    });
};

export default route;
