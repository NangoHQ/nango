import { FLAGS } from './registry.js';

import type { FeatureFlagsClient } from './client.js';

/**
 * Typed facade over the generic OpenFeature client: one named method per flag
 * Nango evaluates, so call sites read `flags.isOAuthStateCookieEnforced(accountId)`
 * instead of repeating the flag key, context shape, and default everywhere.
 *
 * Add a method here when you add a flag to the registry, the method owns the
 * context mapping (targeting key, properties) and the default so it can't drift
 * across call sites.
 */
export interface Flags {
    /**
     * Whether OAuth callbacks missing the state cookie should be rejected for this account.
     * Default `false`
     */
    isOAuthStateCookieEnforced(accountId: number): Promise<boolean>;
}

export function buildFlags(client: FeatureFlagsClient): Flags {
    return {
        isOAuthStateCookieEnforced(accountId) {
            // targetingKey drives gradual-rollout stickiness (same account => same bucket);
            // accountId is exposed as a property so strategies can allow/exclude specific accounts.
            return client.isEnabled(FLAGS.OAUTH_STATE_COOKIE_ENFORCEMENT, { targetingKey: String(accountId), accountId }, false);
        }
    };
}
