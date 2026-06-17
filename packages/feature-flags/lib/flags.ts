import type { FeatureFlagsClient } from './client.js';

/**
 * Typed list of feature flag keys evaluated by Nango code.
 *
 * Each value is the Unleash flag name. These keys are maintained by hand and
 * are intentionally decoupled from the nango-flags repo (the provisioning
 * source of truth): adding a key here does not create the flag in Unleash, and
 * provisioning a flag there does not require a code change. When you add a flag,
 * mirror the name in both places. An unknown / unprovisioned flag simply
 * resolves to the default value passed to `isEnabled`, so drift is safe.
 */
const FLAGS = {
    OAUTH_STATE_COOKIE_ENFORCEMENT: 'oauth-state-cookie-enforcement'
} as const;

/**
 * Typed facade over the generic OpenFeature client: one named method per flag
 * Nango evaluates, so call sites read `flags.isOAuthStateCookieEnforced(accountId)`
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
        isOAuthStateCookieEnforced(accountId: number) {
            // targetingKey drives gradual-rollout stickiness (same account => same bucket);
            // accountId is exposed as a property so strategies can allow/exclude specific accounts.
            return client.isEnabled(FLAGS.OAUTH_STATE_COOKIE_ENFORCEMENT, { targetingKey: String(accountId), accountId }, false);
        }
    };
}

export type Flags = ReturnType<typeof buildFlags>;
