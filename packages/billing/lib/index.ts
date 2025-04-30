import { Billing } from './billing.js';
import { orb } from './clients/orb.js';

export type { BillingIngestEvent, BillingMetric } from './types.js';

export const billing = new Billing(orb);
