import { useCallback, useEffect, useRef, useState } from 'react';

import { environmentQueryKey } from '@/hooks/useEnvironment';
import { fetchCurrentPlan, useApiPostPlanChange } from '@/hooks/usePlan';
import { useToast } from '@/hooks/useToast.js';
import { queryClient } from '@/store';
import { stripePromise } from '@/utils/stripe.js';

import type { StripeError } from '@/utils/stripe.js';
import type { ApiPlan } from '@nangohq/types';

interface PlanChangeRequest {
    orbId: string;
    withGrowthFeatures: boolean;
    /** Whether the account now reflects the change, or null when nothing observable will change. */
    settled: ((plan: ApiPlan) => boolean) | null;
    successTitle: string;
}

const POLL_INTERVAL_MS = 500;

/** A `card_error` carries a message worth showing; anything else is noise to the customer. */
function stripeCardError(error: StripeError): string {
    return error.type === 'card_error'
        ? (error.message ?? 'An error occurred while validating your payment.')
        : 'An error occurred while validating your payment.';
}

/**
 * Posts a plan change and waits for the account to catch up.
 *
 * `POST /plans/change` takes the desired end state rather than a verb, so plan moves and add-on
 * moves are the same request — and the same wait, once the caller says what "done" looks like.
 */
export function usePlanChangeRequest(env: string) {
    const { mutateAsync: postPlanChange } = useApiPostPlanChange(env);
    const { toast } = useToast();

    const [loading, setLoading] = useState(false);
    const [longWait, setLongWait] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const refInterval = useRef<NodeJS.Timeout>();

    useEffect(() => {
        return () => {
            if (refInterval.current) {
                clearInterval(refInterval.current);
            }
        };
    }, []);

    const finish = useCallback(
        async (successTitle: string) => {
            await Promise.all([
                queryClient.invalidateQueries({ exact: false, queryKey: ['plans'], type: 'all' }),
                queryClient.invalidateQueries({ queryKey: environmentQueryKey(env) })
            ]);
            setLongWait(false);
            setLoading(false);
            toast({ title: successTitle, variant: 'success' });
        },
        [env, toast]
    );

    const submit = useCallback(
        async ({ orbId, withGrowthFeatures, settled, successTitle }: PlanChangeRequest): Promise<void> => {
            setLoading(true);
            setLongWait(false);
            setError(null);

            let json: Awaited<ReturnType<typeof postPlanChange>>;
            try {
                json = await postPlanChange({ orbId, withGrowthFeatures });
            } catch {
                setLoading(false);
                setError('An error occurred. Please try again.');
                return;
            }

            if ('paymentIntent' in json.data) {
                const stripe = await stripePromise;
                if (!stripe) {
                    setLoading(false);
                    setError('Payment processor failed to load. Please refresh the page and try again.');
                    return;
                }

                const result = await stripe.confirmCardPayment(json.data.paymentIntent.client_secret);
                if (result.error) {
                    setLoading(false);
                    setError(stripeCardError(result.error));
                    return;
                }
            }

            if (!settled) {
                await finish(successTitle);
                return;
            }

            refInterval.current = setInterval(async () => {
                const current = await fetchCurrentPlan(env).catch(() => null);
                if (!current) {
                    return;
                }
                if (!settled(current.data)) {
                    setLongWait(true);
                    return;
                }
                clearInterval(refInterval.current);
                await finish(successTitle);
            }, POLL_INTERVAL_MS);
        },
        [env, finish, postPlanChange]
    );

    const reset = useCallback(() => setError(null), []);

    return { submit, reset, loading, longWait, error };
}
