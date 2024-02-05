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
    const custom = integration.custom as Record<string, string>;
    const webhookSecret = custom['webhook_secret'];
    if (!webhookSecret) {
        return false;
    }

    const signature = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
    return signature !== headerSignature;
}

const route: WebhookHandler = async (nango, integration, headers, body, rawBody) => {
    const signature = headers['linear-signature'];

    if (!validate(integration, signature, rawBody)) {
        console.error('Linear webhook signature invalid');
        return;
    }

    const parsedBody = body as LinearBody;

    await nango.executeScriptForWebhooks(integration, parsedBody, 'type', 'team.id');

    return { parsedBody };
};

export default route;
