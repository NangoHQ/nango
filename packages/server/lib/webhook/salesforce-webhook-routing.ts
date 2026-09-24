import { getFlags } from '@nangohq/feature-flags';
import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { NANGO_WEBHOOK_SECRET_HEADER, verifyNangoWebhookSecret } from './nango-webhook-secret.js';

import type { WebhookHandler, WebhookResponse } from './types.js';
import type { Result } from '@nangohq/utils';

// Salesforce events come from an Apex trigger the customer installs, not from Salesforce itself, so
// there is no provider signature. The trigger sends the connection's Nango webhook secret instead.
// There is no integration level fallback: that secret would sit in every org's trigger, where any
// org admin could read it and post events for other connections (NAN-6927).
const route: WebhookHandler = async (nango, headers, body) => {
    const connectionId: unknown = body?.nango?.connectionId;
    const connection = typeof connectionId === 'string' && connectionId ? await nango.getConnectionForWebhook(connectionId) : null;
    const secret = connection?.metadata?.['webhookSecret'];

    // An unknown connection, one without a usable secret and one with a secret all answer based only
    // on what the caller sent, so the response does not reveal which connections exist.
    const rejectUnverifiable = (): Result<WebhookResponse> =>
        Err(new NangoError(headers[NANGO_WEBHOOK_SECRET_HEADER] ? 'webhook_invalid_signature' : 'webhook_missing_signature'));

    if (secret) {
        const verified = verifyNangoWebhookSecret({ secret, headers });
        if (verified.isErr()) {
            return verified.error.type === 'webhook_invalid_secret' ? rejectUnverifiable() : Err(verified.error);
        }
    } else {
        nango.markUnverified({
            reason: 'salesforce_missing_webhook_secret',
            remediation: 'Set webhookSecret in the connection metadata and send it from the Apex trigger'
        });

        if (!(await getFlags().allowUnauthorizedSalesforceWebhook(nango.team.uuid))) {
            return rejectUnverifiable();
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
