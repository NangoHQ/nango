import type { WebhookResponse } from './webhook.manager.js';
import type { InternalNango as Nango } from './internal-nango.js';
import type { Config as ProviderConfig } from '../../../models/Provider.js';

export default async function route(
    nango: Nango,
    integration: ProviderConfig,
    headers: Record<string, any>,
    body: Record<string, any>
): Promise<WebhookResponse> {}
