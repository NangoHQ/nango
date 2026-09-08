import { NangoError } from '@nangohq/shared';
import { Err, getLogger, Ok } from '@nangohq/utils';

import { validateHmacSignature } from './signature.js';

import type { NotionWebhook, NotionWebhookVerification, WebhookHandler } from './types.js';

const logger = getLogger('Webhook.Notion');

// The genuine handshake is only ever the token. Anything carrying extra fields is an event
// wearing a verification_token, so it goes through validation instead.
function isVerificationHandshake(body: unknown): body is NotionWebhookVerification {
    return (
        !!body &&
        typeof body === 'object' &&
        'verification_token' in body &&
        typeof (body as NotionWebhookVerification).verification_token === 'string' &&
        Object.keys(body).length === 1
    );
}

const route: WebhookHandler<NotionWebhook | NotionWebhookVerification> = async (nango, headers, body, rawBody) => {
    const signature = headers['x-notion-signature'];
    const verificationToken = nango.integration.custom?.['webhookSecret'];

    if (isVerificationHandshake(body)) {
        logger.info('Received verification request, skipping signature validation', { configId: nango.integration.id });
        nango.markUnverified({ reason: 'notion_verification_handshake', remediation: 'Set the verification token on the integration' });

        return Ok({
            content: { status: 'success' },
            statusCode: 200,
            connectionIds: [],
            toForward: { verification_token: body.verification_token }
        });
    }

    if (verificationToken) {
        if (!signature) {
            logger.error('missing signature', { configId: nango.integration.id });
            return Err(new NangoError('webhook_missing_signature'));
        }

        if (!validateHmacSignature({ secret: verificationToken, rawBody, signature, prefix: 'sha256=' })) {
            logger.error('invalid signature', { configId: nango.integration.id });
            return Err(new NangoError('webhook_invalid_signature'));
        }
    } else {
        nango.markUnverified({ reason: 'notion_missing_verification_token', remediation: 'Set the verification token on the integration' });
    }

    const response = await nango.executeScriptForWebhooks({
        payload: body,
        webhookType: 'type',
        connectionIdentifier: 'workspace_id',
        propName: 'workspace_id'
    });

    const connectionIds = response?.connectionIds || [];

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds,
        toForward: body
    });
};

export default route;
