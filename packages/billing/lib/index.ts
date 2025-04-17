import { lago } from './clients/lago.js';
import { Billing } from './billing.js';

export const billing = new Billing(lago);
