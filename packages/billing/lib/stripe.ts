import Stripe from 'stripe';

import { envs } from './envs.js';

export function getStripe() {
    if (!envs.STRIPE_SECRET_KEY) {
        throw new Error('STRIPE_SECRET_KEY is required to initialize Stripe');
    }

    return new Stripe(envs.STRIPE_SECRET_KEY, {
        apiVersion: '2025-05-28.basil',
        typescript: true,
        telemetry: false
    });
}
