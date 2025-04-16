import { metronome } from './clients/metronome.js';
import { Billing } from './billing.js';

export const billing = new Billing(metronome);
