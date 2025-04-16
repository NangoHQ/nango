import { orb } from './clients/orb.js';
import { Billing } from './billing.js';

export const billing = new Billing(orb);
