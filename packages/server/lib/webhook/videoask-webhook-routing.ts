import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import type { WebhookHandler } from './types.js';

// https://developers.videoask.com/reference/put_forms-form-id-webhooks-tag
const route: WebhookHandler = async (nango, headers, body) => {
    const webhookSecret = nango.integration.custom?.['webhookSecret'];
    const incomingSecret = headers['nango-webhook-secret'];

    if (webhookSecret) {
        if (!incomingSecret || incomingSecret !== webhookSecret) {
            return Err(new NangoError('webhook_invalid_signature'));
        }
    }

    const connectionIdentifierValue = headers['nango-connection-id'];

    if (!connectionIdentifierValue) {
        return Err(new NangoError('webhook_missing_connection_id'));
    }

    const response = await nango.executeScriptForWebhooks({
        body,
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
