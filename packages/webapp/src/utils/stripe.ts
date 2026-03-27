import { loadStripe } from '@stripe/stripe-js';

import { globalEnv } from './env';

const stripePublishableKey = globalEnv.publicStripeKey;
export const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;
