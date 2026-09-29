import { getFlags } from '@nangohq/feature-flags';
import { Ok } from '@nangohq/utils';

import { connectionsWithValidSecret, rejectUnverifiedWebhook } from './nango-webhook-secret.js';

import type { WebhookHandler } from './types.js';

// Salesforce events come from an Apex trigger the customer installs, not from Salesforce itself, so
// there is no provider signature. The trigger sends the connection's Nango webhook secret instead.
// There is no integration level fallback: that secret would sit in every org's trigger, where any
// org admin could read it and post events for other connections (NAN-6927).
const route: WebhookHandler = async (nango, headers, body) => {
    const connectionId: unknown = body?.nango?.connectionId;
    const connection = typeof connectionId === 'string' && connectionId ? await nango.getConnectionForWebhook(connectionId) : null;

    if (connection?.metadata?.['webhookSecret']) {
        if (connectionsWithValidSecret([connection], headers).length === 0) {
            return rejectUnverifiedWebhook(headers);
        }
    } else {
        nango.markUnverified({
            reason: 'salesforce_missing_webhook_secret',
            remediation: 'Set webhookSecret in the connection metadata and send it from the Apex trigger'
        });

        if (!(await getFlags().allowUnauthorizedSalesforceWebhook(nango.team.uuid))) {
            return rejectUnverifiedWebhook(headers);
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
