import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { validateSvixSignature } from './signature.js';

import type { FathomWebhookResponse, WebhookHandler } from './types.js';

// https://developers.fathom.ai/webhooks#verifying-webhooks
const route: WebhookHandler<FathomWebhookResponse> = async (nango, headers, body, rawBody) => {
    const secret = nango.integration.custom?.['webhookSecret'];

    if (secret) {
        const result = validateSvixSignature({ secret, headers, rawBody });

        if (result === 'missing_headers') {
            return Err(new NangoError('webhook_missing_signature'));
        }
        if (result !== 'valid') {
            return Err(new NangoError('webhook_invalid_signature'));
        }
    } else {
        nango.markUnverified({ reason: 'fathom_missing_webhook_secret' });
    }

    const emailAddress = body.recorded_by?.email;

    const response = await nango.executeScriptForWebhooks({
        payload: body,
        connectionIdentifierValue: emailAddress,
        propName: 'metadata.emailAddress'
    });

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: response?.connectionIds || [],
        toForward: body
    });
};

export default route;
