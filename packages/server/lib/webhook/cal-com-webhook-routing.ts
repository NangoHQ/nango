import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { validateHmacSignature } from './signature.js';

import type { WebhookHandler } from './types.js';

const route: WebhookHandler = async (nango, headers, body, rawBody, query) => {
    // https://cal.com/docs/developing/guides/automation/webhooks#verifying-the-authenticity-of-the-received-payload
    const signatureHeader = headers['x-cal-signature-256'];
    const webhookSecret = nango.integration.custom?.['webhookSecret'];

    if (webhookSecret) {
        if (!signatureHeader) {
            return Err(new NangoError('webhook_missing_signature'));
        }

        if (!validateHmacSignature({ secret: webhookSecret, rawBody, signature: signatureHeader })) {
            return Err(new NangoError('webhook_invalid_signature'));
        }
    } else {
        nango.markUnverified({ reason: 'cal_com_missing_webhook_secret' });
    }

    const connectionIdentifierValue = query?.['nangoConnectionId'] ?? body.nangoConnectionId;

    if (!connectionIdentifierValue) {
        return Err(new NangoError('webhook_missing_connection_id'));
    }

    const response = await nango.executeScriptForWebhooks({
        payload: body,
        webhookType: 'triggerEvent',
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
