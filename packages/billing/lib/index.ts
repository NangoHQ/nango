import { Billing } from './billing.js';
import { lago } from './clients/lago.js';

export type { BillingIngestEvent, BillingMetric } from './types.js';

export const billing = new Billing(lago);
