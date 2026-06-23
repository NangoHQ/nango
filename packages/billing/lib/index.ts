import { Billing } from './billing.js';
import { NoopBillingClient } from './clients/noop/client.js';
import { OrbClient } from './clients/orb/client.js';
import { envs } from './envs.js';

// Fall back to a stub client when Orb isn't configured (local dev / self-hosted),
// so billing-touching flows don't fail on the missing dependency. Deployed
// environments always set ORB_API_KEY and use the real Orb client.
export const billing = new Billing(envs.ORB_API_KEY ? new OrbClient() : new NoopBillingClient());

export { getStripe } from './stripe.js';
