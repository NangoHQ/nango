import { Billing } from './billing.js';
import { OrbClient } from './clients/orb.js';

export const billing = new Billing(new OrbClient());

export { getStripe } from './stripe.js';
