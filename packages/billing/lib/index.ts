import { Billing } from './billing.js';
import { orb } from './clients/orb.js';

export const billing = new Billing(orb);
