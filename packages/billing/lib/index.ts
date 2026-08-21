import { Billing } from './billing.js';
import { NoopBillingClient } from './clients/noop/client.js';
import { OrbClient } from './clients/orb/client.js';
import { envs } from './envs.js';
import { logger } from './logger.js';

// Fall back to a stub client when Orb isn't configured (local dev / self-hosted),
// so billing-touching flows don't fail on the missing dependency. Deployed
// environments always set ORB_API_KEY and use the real Orb client. Log the fallback
// so an accidentally-missing key in a deployed environment isn't silent.
const orbConfigured = Boolean(envs.ORB_API_KEY);
if (!orbConfigured) {
    logger.warning(
        'ORB_API_KEY is not set — using a no-op billing client. Billing events are dropped and subscriptions/customers are stubbed. Expected in local dev and self-hosted; unexpected in a deployed environment.'
    );
}
export const billing = new Billing(orbConfigured ? new OrbClient() : new NoopBillingClient());

export { getStripe } from './stripe.js';
