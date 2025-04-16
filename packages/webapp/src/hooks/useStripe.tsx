import { apiFetch } from '../utils/api';

import type { PostStripeSessionCheckout } from '@nangohq/types';

export async function apiPostStripeSessionCheckout(env: string, body: PostStripeSessionCheckout['Body']) {
    const res = await apiFetch(`/api/v1/stripe/checkout?env=${env}`, {
        method: 'POST',
        body: JSON.stringify(body)
    });

    return {
        res,
        json: (await res.json()) as PostStripeSessionCheckout['Reply']
    };
}
