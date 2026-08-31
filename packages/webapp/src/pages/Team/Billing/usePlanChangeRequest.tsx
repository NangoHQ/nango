import { useCallback, useEffect, useRef, useState } from 'react';

import { Alert, AlertDescription } from '@nangohq/design-system';

import { CriticalErrorAlert } from '@/components/patterns/CriticalErrorAlert';
import { environmentQueryKey } from '@/hooks/useEnvironment';
import { fetchCurrentPlan, useApiPostPlanChange } from '@/hooks/usePlan';
import { useToast } from '@/hooks/useToast.js';
import { queryClient } from '@/store';
import { stripePromise } from '@/utils/stripe.js';

import type { StripeError } from '@/utils/stripe.js';
import type { ApiPlan } from '@nangohq/types';

interface PlanChangeRequest {
    orbId: string;
    settled?: (plan: ApiPlan) => boolean;
    successTitle: string;
}

const POLL_INTERVAL_MS = 500;

/** A `card_error` carries a message worth showing; anything else is noise to the customer. */
function stripeCardError(error: StripeError): string {
    return error.type === 'card_error'
        ? (error.message ?? 'An error occurred while validating your payment.')
        : 'An error occurred while validating your payment.';
}

/** Plan moves and add-on moves are one request, so they are one wait once the caller says what "done" is. */
export function usePlanChangeRequest(env: string) {
    const { mutateAsync: postPlanChange } = useApiPostPlanChange(env);
    const { toast } = useToast();

    const [loading, setLoading] = useState(false);
    const [longWait, setLongWait] = useState(false);
    // `critical` marks the failures retrying never helps: a declined card is the customer's to act on.
    const [error, setError] = useState<{ message: string; critical: boolean } | null>(null);

    const fail = useCallback((message: string, critical: boolean) => {
        setLoading(false);
        setLongWait(false);
        setError({ message, critical });
        return false;
    }, []);
    // Set on unmount so an in-flight wait stops rather than setting state on a gone component.
    const abandoned = useRef(false);
    useEffect(() => {
        abandoned.current = false;
        return () => {
            abandoned.current = true;
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
        async ({ orbId, settled, successTitle }: PlanChangeRequest): Promise<boolean> => {
            setLoading(true);
            setLongWait(false);
            setError(null);

            let json: Awaited<ReturnType<typeof postPlanChange>>;
            try {
                json = await postPlanChange({ orbId });
            } catch {
                return fail('Something went wrong', true);
            }

            if ('paymentIntent' in json.data) {
                const stripe = await stripePromise;
                if (!stripe) {
                    return fail('Payment processor failed to load. Please refresh the page and try again.', false);
                }

                const result = await stripe.confirmCardPayment(json.data.paymentIntent.client_secret);
                if (result.error) {
                    return fail(stripeCardError(result.error), false);
                }
            }

            // The plan row lags the response wherever a webhook applies the change — Orb's for a
            // downgrade, Stripe's for a paid upgrade. NAN-6840 covers giving this wait a deadline.
            if (settled) {
                const caughtUp = await waitFor(() => fetchCurrentPlan(env).then((current) => settled(current.data)), abandoned, setLongWait);
                if (!caughtUp || abandoned.current) {
                    return false;
                }
            }

            await finish(successTitle);
            return true;
        },
        [env, fail, finish, postPlanChange]
    );

    const reset = useCallback(() => setError(null), []);

    return { submit, reset, loading, longWait, error };
}

async function waitFor(check: () => Promise<boolean>, abandoned: { current: boolean }, onWait: (waiting: boolean) => void): Promise<boolean> {
    while (!abandoned.current) {
        if (await check().catch(() => false)) {
            return true;
        }
        onWait(true);
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    return false;
}

export interface PlanChangeError {
    message: string;
    critical: boolean;
}

export const PlanChangeErrorAlert: React.FC<{ error: PlanChangeError | null }> = ({ error }) => {
    if (!error) {
        return null;
    }
    if (error.critical) {
        return <CriticalErrorAlert message={error.message} />;
    }
    return (
        <Alert variant="danger">
            <AlertDescription>{error.message}</AlertDescription>
        </Alert>
    );
};
