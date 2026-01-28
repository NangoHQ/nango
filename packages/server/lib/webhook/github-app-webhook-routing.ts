import crypto from 'node:crypto';

import { NangoError } from '@nangohq/shared';
import { Err, Ok, getLogger } from '@nangohq/utils';

import type { WebhookHandler } from './types.js';
import type { IntegrationConfig } from '@nangohq/types';

const logger = getLogger('Webhook.GithubApp');

function validate(integration: IntegrationConfig, headerSignature: string, rawBody: string): boolean {
    if (!integration.oauth_client_secret) {
        return false;
    }

    const decodedSecret = Buffer.from(integration.oauth_client_secret, 'base64').toString('ascii');

    const hash = `${integration.oauth_client_id}${decodedSecret}${integration.app_link}`;
    const secret = crypto.createHash('sha256').update(hash).digest('hex');

    const signature = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');

    const trusted = Buffer.from(`sha256=${signature}`, 'ascii');
    const untrusted = Buffer.from(headerSignature, 'ascii');

    return trusted.length === untrusted.length && crypto.timingSafeEqual(trusted, untrusted);
}

const route: WebhookHandler = async (nango, headers, body, rawBody) => {
    const signature = headers?.['x-hub-signature-256'];

    if (signature) {
        const valid = validate(nango.integration, signature, rawBody);

        if (!valid) {
            logger.error('Github App webhook signature invalid');
            return Err(new NangoError('webhook_invalid_signature'));
        }
    }

    const response = await nango.executeScriptForWebhooks({
        body,
        webhookHeaderValue: headers['x-github-event'] as string,
        connectionIdentifier: 'installation.id',
        propName: 'installation_id'
    });
    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: response?.connectionIds || [],
        toForward: body
    });
};

export default route;
