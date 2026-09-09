import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { safeCompare } from './signature.js';

import type { WebhookHandler } from './types.js';

// https://developers.videoask.com/reference/put_forms-form-id-webhooks-tag
const route: WebhookHandler = async (nango, headers, body) => {
    const webhookSecret = nango.integration.custom?.['webhookSecret'];
    const incomingSecret = headers['nango-webhook-secret'];

    if (webhookSecret) {
        if (!incomingSecret || !safeCompare(webhookSecret, incomingSecret)) {
            return Err(new NangoError('webhook_invalid_signature'));
        }
    } else {
        nango.markUnverified({ reason: 'videoask_missing_webhook_secret' });
    }

    const connectionIdentifierValue = headers['nango-connection-id'];

    if (!connectionIdentifierValue) {
        return Err(new NangoError('webhook_missing_connection_id'));
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
