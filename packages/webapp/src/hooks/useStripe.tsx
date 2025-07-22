import { useQuery } from '@tanstack/react-query';

import { APIError, apiFetch } from '../utils/api';

import type { GetStripePaymentMethods, PostStripeCollectPayment } from '@nangohq/types';

export function useStripePaymentMethods(env: string) {
    return useQuery<GetStripePaymentMethods['Success'], APIError>({
        queryKey: ['stripe', 'payment_methods'],
        queryFn: async (): Promise<GetStripePaymentMethods['Success']> => {
            const res = await apiFetch(`/api/v1/stripe/payment_methods?env=${env}`, {
                method: 'GET'
            });

            const json = (await res.json()) as GetStripePaymentMethods['Reply'];
            if (res.status !== 200 || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json;
        }
    });
}

export async function apiPostStripeCollectPayment(env: string) {
    const res = await apiFetch(`/api/v1/stripe/payment_methods?env=${env}`, {
        method: 'POST'
    });

    return {
        res,
        json: (await res.json()) as PostStripeCollectPayment['Reply']
    };
}

export async function apiDeleteStripePayment(env: string, paymentId: string) {
    const res = await apiFetch(`/api/v1/stripe/payment_methods?env=${env}&payment_id=${paymentId}`, {
        method: 'DELETE'
    });

    return {
        res,
        json: (await res.json()) as PostStripeCollectPayment['Reply']
    };
}
