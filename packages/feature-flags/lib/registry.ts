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
    // Reference flags; mirror flags/*.yaml in nango-flags. Safe to remove once real flags exist.
    // Boolean — read with client.isEnabled(FLAGS.EXAMPLE_FLAG, ctx, false).
    EXAMPLE_FLAG: 'example-flag',
    // Non-boolean (string) — read with client.getString(FLAGS.EXAMPLE_VARIANT, ctx, 'control').
    // Number/JSON flags use client.getNumber / client.getObject.
    EXAMPLE_VARIANT: 'example-variant'
} as const;

export type FlagKey = (typeof FLAGS)[keyof typeof FLAGS];
