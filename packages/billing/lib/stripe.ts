import Stripe from 'stripe';

import { envs } from './envs.js';

export function getStripe() {
    return new Stripe(envs.STRIPE_SECRET_KEY!, {
        apiVersion: '2025-05-28.basil',
        typescript: true,
        telemetry: false
    });
}
