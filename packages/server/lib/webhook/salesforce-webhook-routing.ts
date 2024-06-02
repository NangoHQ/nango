import type { InternalNango as Nango } from './internal-nango.js';
import type { Config as ProviderConfig } from '@nangohq/shared';
import type { LogContextGetter } from '@nangohq/logs';

export default async function route(nango: Nango, integration: ProviderConfig, _headers: Record<string, any>, body: any, logContextGetter: LogContextGetter) {
    return nango.executeScriptForWebhooks(integration, body, 'nango.eventType', 'nango.connectionId', logContextGetter, 'connectionId');
}
