import { getFlags } from '@nangohq/feature-flags';
import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { verifyNangoWebhookSecret } from './nango-webhook-secret.js';

import type { WebhookHandler } from './types.js';

// Salesforce events come from an Apex trigger the customer installs, not from Salesforce itself, so
// there is no provider signature. The trigger sends the Nango webhook secret instead.
const route: WebhookHandler = async (nango, headers, body, _rawBody, query) => {
    const connectionId: unknown = body?.nango?.connectionId;
    const connection = typeof connectionId === 'string' && connectionId ? await nango.getConnectionForWebhook(connectionId) : null;

    // The trigger runs in the end user's org, where its admins can read it, so a per connection
    // secret keeps one org from posting events for another. The integration secret stays supported.
    const connectionSecret = connection?.metadata?.['webhookSecret'];
    if (connectionSecret != null && typeof connectionSecret !== 'string') {
        return Err(new NangoError('webhook_invalid_secret', { reason: 'Invalid webhook secret' }));
    }

    const secret = connectionSecret || nango.integration.custom?.['webhookSecret'];

    if (secret) {
        const verified = verifyNangoWebhookSecret({ secret, headers, query });
        if (verified.isErr()) {
            return Err(verified.error);
        }
    } else {
        nango.markUnverified({
            reason: 'salesforce_missing_webhook_secret',
            remediation: 'Set webhookSecret in the connection metadata and send it from the Apex trigger'
        });

        if (!(await getFlags().allowUnauthorizedSalesforceWebhook(nango.team.uuid))) {
            return Err(new NangoError('webhook_invalid_secret', { reason: 'No webhook secret configured to validate this request' }));
        }
    }

    const response = await nango.executeScriptForWebhooks({
        payload: body,
        webhookType: 'nango.eventType',
        connectionIdentifier: 'nango.connectionId',
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
