/**
 * Typed registry of feature flag keys evaluated by Nango code.
 *
 * Each value is the Unleash flag name. These keys are maintained by hand and
 * are intentionally decoupled from the nango-flags repo (the provisioning
 * source of truth): adding a key here does not create the flag in Unleash, and
 * provisioning a flag there does not require a code change. When you add a flag,
 * mirror the name in both places. An unknown / unprovisioned flag simply
 * resolves to the default value passed to `isEnabled`, so drift is safe.
 *
 * Usage:
 *   import { FLAGS } from '@nangohq/feature-flags';
 *   await client.isEnabled(FLAGS.EXAMPLE_FLAG, { 'account.uuid': uuid }, false);
 */
export const FLAGS = {
    OAUTH_STATE_COOKIE_ENFORCEMENT: 'oauth-state-cookie-enforcement'
} as const;

export type FlagKey = (typeof FLAGS)[keyof typeof FLAGS];
