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
         * Whether this account may deploy functions. Gated to an allowlist of accounts while the
         * function primitive is rolled out. Default `false`.
         */
        canDeployFunctions(accountUuid: string) {
            // accountUuid is exposed as a property so the Unleash strategy can allowlist specific accounts.
            return client.isEnabled('function-deployment', { targetingKey: accountUuid, accountUuid }, false);
        }
    };
}

export type Flags = ReturnType<typeof buildFlags>;
