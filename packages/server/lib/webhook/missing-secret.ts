import { metrics } from '@nangohq/utils';

import type { DBIntegrationDecrypted } from '@nangohq/types';

/** Completes "<remediation> to enable verification." */
const DEFAULT_REMEDIATION = 'Set the webhook secret on the integration';

type Integration = Pick<DBIntegrationDecrypted, 'provider' | 'unique_key'>;

export interface UnverifiedWebhook {
    reason: string;
    remediation?: string | undefined;
}

export function countUnverifiedWebhook(provider: string, reason: string): void {
    metrics.increment(metrics.Types.WEBHOOK_INCOMING_UNVERIFIED, 1, { provider, reason });
}

export function unverifiedWebhookMessage(integration: Integration, unverified: UnverifiedWebhook): string {
    const remediation = unverified.remediation ?? DEFAULT_REMEDIATION;

    return `This webhook was not verified. Anyone who knows your webhook URL can send events that Nango will process and forward as if they came from ${integration.provider}. ${remediation} to enable verification.`;
}
