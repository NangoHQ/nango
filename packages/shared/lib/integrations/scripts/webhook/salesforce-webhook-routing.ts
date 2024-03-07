import type { InternalNango as Nango } from './internal-nango.js';
import type { Config as ProviderConfig } from '../../../models/Provider.js';

export default async function route(nango: Nango, integration: ProviderConfig, _headers: Record<string, any>, body: any) {
    return nango.executeScriptForWebhooks(integration, body, 'nango.eventType', 'nango.connectionId', 'connectionId');
}
