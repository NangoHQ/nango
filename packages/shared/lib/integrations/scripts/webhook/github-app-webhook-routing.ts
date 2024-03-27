import type { InternalNango as Nango } from './internal-nango.js';
import type { Config as ProviderConfig } from '../../../models/Provider.js';
import { getLogger } from '@nangohq/utils/dist/logger.js';

import crypto from 'crypto';

const logger = getLogger('Webook.GithubApp');

function validate(integration: ProviderConfig, headerSignature: string, body: any): boolean {
    const hash = `${integration.oauth_client_id}${integration.oauth_client_secret}${integration.app_link}`;
    const secret = crypto.createHash('sha256').update(hash).digest('hex');

    const signature = crypto.createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex');

    const trusted = Buffer.from(`sha256=${signature}`, 'ascii');
    const untrusted = Buffer.from(headerSignature, 'ascii');

    return crypto.timingSafeEqual(trusted, untrusted);
}

export default async function route(nango: Nango, integration: ProviderConfig, headers: Record<string, any>, body: any) {
    const signature = headers['x-hub-signature-256'];

    if (signature) {
        logger.info('Signature found, verifying...');
        const valid = validate(integration, signature, body);

        if (!valid) {
            logger.error('Github App webhook signature invalid');
            return;
        }
    }

    return nango.executeScriptForWebhooks(integration, body, 'installation.id', 'installation_id');
}
