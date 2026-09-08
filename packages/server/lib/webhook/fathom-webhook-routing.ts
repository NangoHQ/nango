import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { validateSvixSignature } from './signature.js';

import type { FathomWebhookResponse, WebhookHandler } from './types.js';

/** Verifies against `secret` and maps a failure to the matching error, or returns null when valid. */
function verifyOrError(secret: string, headers: Record<string, string>, rawBody: string): NangoError | null {
    const result = validateSvixSignature({ secret, headers, rawBody });

    if (result === 'valid') {
        return null;
    }

    return new NangoError(result === 'missing_headers' ? 'webhook_missing_signature' : 'webhook_invalid_signature');
}

const route: WebhookHandler<FathomWebhookResponse> = async (nango, headers, body, rawBody, query) => {
    // Prefer the nangoConnectionId query param when the webhook URL was registered with one;
    // otherwise fall back to matching on the recording owner's email, as before.
    const nangoConnectionId = query?.['nangoConnectionId'];
    const emailAddress = body.recorded_by?.email;

    if (nangoConnectionId) {
        const connection = await nango.getConnectionForWebhook(nangoConnectionId);
        if (!connection) {
            return Err(new NangoError('webhook_invalid_secret', { reason: 'No webhook secret configured to validate this request' }));
        }

        const connectionSecret = connection.metadata?.['webhookSecret'];
        if (connectionSecret != null && typeof connectionSecret !== 'string') {
            return Err(new NangoError('webhook_invalid_secret', { reason: 'Invalid webhook secret' }));
        }
        if (!connectionSecret) {
            return Err(new NangoError('webhook_invalid_secret', { reason: 'No webhook secret configured to validate this request' }));
        }

        const error = verifyOrError(connectionSecret, headers, rawBody);
        if (error) {
            return Err(error);
        }
    } else {
        const integrationSecret = nango.integration.custom?.['webhookSecret'];
        if (integrationSecret) {
            const error = verifyOrError(integrationSecret, headers, rawBody);
            if (error) {
                return Err(error);
            }
        } else {
            nango.markUnverified({ reason: 'fathom_missing_webhook_secret' });
        }
    }

    const response = await nango.executeScriptForWebhooks(
        nangoConnectionId
            ? {
                  payload: body,
                  connectionIdentifierValue: nangoConnectionId,
                  propName: 'connectionId'
              }
            : {
                  payload: body,
                  connectionIdentifierValue: emailAddress,
                  propName: 'metadata.emailAddress'
              }
    );

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: response?.connectionIds || [],
        toForward: body
    });
};

export default route;
