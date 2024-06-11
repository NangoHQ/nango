import type { WebhookHandler } from './types.js';
import type { Config as ProviderConfig } from '@nangohq/shared';
import { getLogger } from '@nangohq/utils';

import crypto from 'crypto';
import type { LogContextGetter } from '@nangohq/logs';

const logger = getLogger('Webook.GithubApp');

function validate(integration: ProviderConfig, headerSignature: string, body: any): boolean {
    const hash = `${integration.oauth_client_id}${integration.oauth_client_secret}${integration.app_link}`;
    const secret = crypto.createHash('sha256').update(hash).digest('hex');

    const signature = crypto.createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex');

    const trusted = Buffer.from(`sha256=${signature}`, 'ascii');
    const untrusted = Buffer.from(headerSignature, 'ascii');

    return crypto.timingSafeEqual(trusted, untrusted);
}

const route: WebhookHandler = async (nango, integration, headers, body, _rawBody, logContextGetter: LogContextGetter) => {
    const signature = headers['x-hub-signature-256'];

    if (signature) {
        logger.info('Signature found, verifying...');
        const valid = validate(integration, signature, body);

        if (!valid) {
            logger.error('Github App webhook signature invalid');
            return;
        }
    }

    return nango.executeScriptForWebhooks(integration, body, 'action', 'installation.id', logContextGetter, 'installation_id');
};

export default route;
