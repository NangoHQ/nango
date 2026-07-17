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
         * Whether persist auth resolves the minimal PersistAuthContext via the light
         * lookup instead of the full account context query. No account is known before
         * the lookup, so gradual rollout buckets per evaluation — use random stickiness.
         * Default `false`.
         */
        shouldUseLightPersistAuthContext() {
            return client.isEnabled('persist-light-auth-context', {}, false);
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
         * Whether the audit trail is enabled for this account. **Temporary** rollout
         * safeguard: gated per-account so we can enable specific test accounts first,
         * then ramp. To be replaced by a plan-based entitlement (opt-in via account
         * plans) once the audit trail is productized. Default `false`.
         */
        isAuditTrailEnabled(accountUuid: string) {
            // targetingKey drives gradual-rollout stickiness; accountUuid lets strategies allow/exclude specific accounts.
            return client.isEnabled('audit-trail', { targetingKey: accountUuid, accountUuid }, false);
        }
    };
}

export type Flags = ReturnType<typeof buildFlags>;
