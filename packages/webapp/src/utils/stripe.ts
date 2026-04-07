import { loadStripe } from '@stripe/stripe-js';

import { globalEnv } from './env';

import type { StripeError } from '@stripe/stripe-js';

const stripePublishableKey = globalEnv.publicStripeKey;
export const stripePromise = loadStripe(stripePublishableKey);
export type { StripeError };
