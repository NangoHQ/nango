import type { FeatureFlagsClient } from './client.js';

/**
 * Typed facade over the generic OpenFeature client: one named method per flag
 * Nango evaluates, so call sites read `getFlags().isOAuthStateCookieEnforced(accountId)`
 * instead of repeating the flag key, context shape, and default everywhere.
 *
 * Add a method here when you add a flag, the method owns the context mapping
 * (targeting key, properties) and the default so it can't drift across call sites.
 */
export function buildFlags(client: FeatureFlagsClient) {
    return {
        /**
         * Whether OAuth callbacks missing the state cookie should be rejected for this account.
         * Default `false`
         */
        isOAuthStateCookieEnforced(accountUuid: string) {
            // targetingKey drives gradual-rollout stickiness (same account => same bucket);
            // accountUuid is exposed as a property so strategies can allow/exclude specific accounts.
            return client.isEnabled('oauth-state-cookie-enforcement', { targetingKey: accountUuid, accountUuid }, false);
        },
        /**
         * Sets Datadog manual.keep on action execution traces for this environment,
         * raising ingestion priority during stall investigations. Default `false`.
         */
        shouldKeepActionTrace(environmentId: number) {
            return client.isEnabled('action-trace-manual-keep', { targetingKey: String(environmentId), environmentId }, false);
        },
        /**
         * Whether to send sync completion webhooks for this environment and provider.
         * Default `true`.
         */
        shouldSendSyncCompletedWebhook(environmentId: number, providerConfigKey: string) {
            return client.isEnabled(
                'sync-completion-webhook-for-webhook-operation',
                {
                    targetingKey: `${environmentId}:${providerConfigKey}`,
                    environmentId,
                    providerConfigKey
                },
                true
            );
        },
        /**
         * Whether proxy responses forward all provider headers (minus hop-by-hop / CORS)
         * instead of the buffered-path allowlist. Default `false`.
         */
        shouldForwardAllProxyResponseHeaders(accountUuid: string) {
            return client.isEnabled('proxy-forward-all-response-headers', { targetingKey: accountUuid, accountUuid }, false);
        }
    };
}

export type Flags = ReturnType<typeof buildFlags>;
