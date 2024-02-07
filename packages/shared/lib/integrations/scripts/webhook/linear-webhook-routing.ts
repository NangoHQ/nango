import crypto from 'node:crypto';

import type { Config as ProviderConfig } from '../../../models/Provider.js';
import type { WebhookHandler } from './types.js';

interface LinearBody {
    action: string;
    data: Record<string, unknown>;
    type: string;
    createdAt: string;
}

function validate(integration: ProviderConfig, headerSignature: string, rawBody: string): boolean {
    if (!integration.custom?.['webhookSecret']) {
        return false;
    }

    const signature = crypto.createHmac('sha256', integration.custom['webhookSecret']).update(rawBody).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(headerSignature));
}

const route: WebhookHandler = async (nango, integration, headers, body, rawBody) => {
    const signature = headers['linear-signature'];

    console.log('[webhook/linear] received', { configId: integration.id });

    if (!validate(integration, signature, rawBody)) {
        console.log('[webhook/linear] invalid signature', { configId: integration.id });
        return;
    }

    const parsedBody = body as LinearBody;
    console.log(`[webhook/linear] valid ${parsedBody.type}`, { configId: integration.id });

    await nango.executeScriptForWebhooks(integration, parsedBody, 'type', 'organizationId', 'organizationId');

    return { parsedBody };
};

export default route;
