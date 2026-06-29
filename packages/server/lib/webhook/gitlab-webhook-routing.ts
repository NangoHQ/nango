import crypto from 'node:crypto';

import { NangoError } from '@nangohq/shared';
import { Err, getLogger, Ok } from '@nangohq/utils';

import type { WebhookHandler } from './types.js';
import type { IntegrationConfig } from '@nangohq/types';

const logger = getLogger('Webhook.Gitlab');

/**
 * GitLab does not sign the payload; it echoes back the secret token configured on the hook
 * in the `X-Gitlab-Token` header, so verification is a constant-time comparison.
 * https://docs.gitlab.com/user/project/integrations/webhooks/#validate-payloads-by-using-a-secret-token
 */
function validate(integration: IntegrationConfig, headerToken: string | undefined): boolean {
    const secret = integration.custom?.['webhookSecret'];
    if (!secret) {
        // No secret configured: allow through until connection-level webhook validation exists.
        return true;
    }

    if (!headerToken) {
        return false;
    }

    const expectedBuffer = Buffer.from(secret);
    const receivedBuffer = Buffer.from(headerToken);

    return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

const route: WebhookHandler = async (nango, headers, body, _rawBody, query) => {
    if (!validate(nango.integration, headers['x-gitlab-token'])) {
        logger.error('invalid token', { configId: nango.integration.id });
        return Err(new NangoError('webhook_invalid_signature'));
    }

    // GitLab payloads carry no Nango connection id, so route by the nangoConnectionId query param on the webhook URL.
    const connectionIdentifierValue = query?.['nangoConnectionId'] ?? body?.nangoConnectionId;

    if (!connectionIdentifierValue) {
        return Err(new NangoError('webhook_missing_connection_id'));
    }

    const response = await nango.executeScriptForWebhooks({
        body,
        webhookHeaderValue: headers['x-gitlab-event'] as string,
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
