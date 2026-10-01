import type * as webhookHandlers from './index.js';
import type { Provider } from '@nangohq/types';

/** Routing scripts that reject unverified webhooks unless the integration sets `allow_unverified_webhooks`. */
const ENFORCING_ROUTING_SCRIPTS = new Set<string>([
    'githubAppWebhookRouting',
    'githubAppOauthWebhookRouting',
    'gmailWebhookRouting',
    'microsoftTeamsWebhookRouting',
    'salesforceWebhookRouting'
] satisfies (keyof typeof webhookHandlers)[]);

export function canAllowUnverifiedWebhooks(provider: Pick<Provider, 'webhook_routing_script'>): boolean {
    return !!provider.webhook_routing_script && ENFORCING_ROUTING_SCRIPTS.has(provider.webhook_routing_script);
}
