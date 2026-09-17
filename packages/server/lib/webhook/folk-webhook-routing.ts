import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { validateSvixSignature } from './signature.js';

import type { FolkWebhookPayload, WebhookHandler } from './types.js';

const route: WebhookHandler<FolkWebhookPayload> = async (nango, headers, body, rawBody, query) => {
    const connectionIdentifierValue = query?.['nangoConnectionId'];

    if (!connectionIdentifierValue) {
        return Err(new NangoError('webhook_missing_connection_id'));
    }

    const connection = await nango.getConnectionForWebhook(connectionIdentifierValue);

    // Folk registers webhooks per connection, so the secret belongs on the connection. The
    // integration level secret stays supported for integrations that only have one connection.
    const connectionSecret = connection?.metadata?.['webhookSecret'];

    if (connectionSecret != null && typeof connectionSecret !== 'string') {
        return Err(new NangoError('webhook_invalid_secret', { reason: 'Invalid webhook secret' }));
    }

    const secret = connectionSecret || nango.integration.custom?.['webhookSecret'];

    // Verified before the unknown-connection response, otherwise an unresolvable connection id
    // returns a 200 that forwards the unverified body to the environment's webhook URLs.
    if (secret) {
        if (validateSvixSignature({ secret, headers, rawBody }) !== 'valid') {
            return Err(new NangoError('webhook_invalid_signature'));
        }
    } else {
        nango.markUnverified({
            reason: 'folk_missing_webhook_secret',
            remediation: 'Set webhookSecret in the connection metadata'
        });
    }

    if (!connection) {
        return Ok({ content: null, statusCode: 204 });
    }

    const response = await nango.executeScriptForWebhooks({
        payload: body,
        webhookType: 'type',
        connectionIdentifierValue,
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
