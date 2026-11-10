import { NangoError } from '@nangohq/shared';
import { Err, getLogger, Ok } from '@nangohq/utils';

import { validateHmacSignature } from './signature.js';

import type { DocusignWebhookEvent, WebhookHandler } from './types.js';

const logger = getLogger('Webhook.Docusign');

const MISSING_SECRET = {
    reason: 'docusign_missing_webhook_secret',
    remediation: 'Set the Connect HMAC key of the DocuSign account that owns your integration key as the integration webhook secret'
};

const route: WebhookHandler<DocusignWebhookEvent> = async (nango, headers, body, rawBody) => {
    const secret = nango.integration.custom?.['webhookSecret'];

    if (secret) {
        const signatures = Object.entries(headers)
            .filter(([name, value]) => /^x-docusign-signature-\d+$/.test(name) && typeof value === 'string' && value.length > 0)
            .map(([, value]) => value);

        if (signatures.length === 0) {
            logger.error('missing signature', { configId: nango.integration.id });
            return Err(new NangoError('webhook_missing_signature'));
        }

        if (!signatures.some((signature) => validateHmacSignature({ secret, rawBody, signature, digest: 'base64' }))) {
            logger.error('invalid signature', { configId: nango.integration.id });
            return Err(new NangoError('webhook_invalid_signature'));
        }
    } else {
        const outcome = await nango.unverifiedOutcome();
        nango.markUnverified(MISSING_SECRET, outcome);

        if (outcome === 'rejected') {
            return Err(new NangoError('webhook_invalid_secret', { reason: 'No webhook secret configured to validate this request' }));
        }
    }

    const response = await nango.executeScriptForWebhooks({
        payload: body,
        webhookType: 'event',
        connectionIdentifier: 'data.accountId',
        propName: 'accountId'
    });

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: response?.connectionIds || [],
        toForward: body
    });
};

export default route;
