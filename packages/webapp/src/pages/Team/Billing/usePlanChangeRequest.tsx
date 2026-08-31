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
    withGrowthFeatures: boolean;
    /** Whether the account now reflects the change, or null when nothing observable will change. */
    settled: ((plan: ApiPlan) => boolean) | null;
    successTitle: string;
}

const POLL_INTERVAL_MS = 500;
const POLL_INTERVAL_MAX_MS = 2_000;
/** Orb applies a change asynchronously; past this it is not going to land on its own. */
const POLL_TIMEOUT_MS = 30_000;

/** A `card_error` carries a message worth showing; anything else is noise to the customer. */
function stripeCardError(error: StripeError): string {
    return error.type === 'card_error'
        ? (error.message ?? 'An error occurred while validating your payment.')
        : 'An error occurred while validating your payment.';
}

/**
 * `POST /plans/change` takes an end state rather than a verb, so plan moves and add-on moves are the
 * same request — and the same wait, once the caller says what "done" looks like.
 */
export function usePlanChangeRequest(env: string) {
    const { mutateAsync: postPlanChange } = useApiPostPlanChange(env);
    const { toast } = useToast();

    const [loading, setLoading] = useState(false);
    const [longWait, setLongWait] = useState(false);
    // `critical` marks the failures retrying never helps: a declined card is the customer's to act on.
    const [error, setError] = useState<{ message: string; critical: boolean } | null>(null);
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
        async ({ orbId, withGrowthFeatures, settled, successTitle }: PlanChangeRequest): Promise<boolean> => {
            setLoading(true);
            setLongWait(false);
            setError(null);

            let json: Awaited<ReturnType<typeof postPlanChange>>;
            try {
                json = await postPlanChange({ orbId, withGrowthFeatures });
            } catch {
                setLoading(false);
                setError({ message: 'Something went wrong', critical: true });
                return false;
            }

            if ('paymentIntent' in json.data) {
                const stripe = await stripePromise;
                if (!stripe) {
                    setLoading(false);
                    setError({ message: 'Payment processor failed to load. Please refresh the page and try again.', critical: false });
                    return false;
                }

                const result = await stripe.confirmCardPayment(json.data.paymentIntent.client_secret);
                if (result.error) {
                    setLoading(false);
                    setError({ message: stripeCardError(result.error), critical: false });
                    return false;
                }
            }

            if (settled) {
                const caughtUp = await waitFor(() => fetchCurrentPlan(env).then((current) => settled(current.data)), abandoned, setLongWait);
                if (abandoned.current) {
                    return false;
                }
                if (!caughtUp) {
                    setLoading(false);
                    setError({ message: 'The change was made but this page could not confirm it', critical: true });
                    return false;
                }
            }

            await finish(successTitle);
            return true;
        },
        [env, finish, postPlanChange]
    );

    const reset = useCallback(() => setError(null), []);

    return { submit, reset, loading, longWait, error };
}

async function waitFor(check: () => Promise<boolean>, abandoned: { current: boolean }, onWait: (waiting: boolean) => void): Promise<boolean> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let wait = POLL_INTERVAL_MS;
    while (Date.now() < deadline) {
        if (abandoned.current) {
            return false;
        }
        if (await check().catch(() => false)) {
            return true;
        }
        onWait(true);
        await new Promise((resolve) => setTimeout(resolve, wait));
        // Backs off so a slow change costs a handful of reads rather than one every half second.
        wait = Math.min(wait * 2, POLL_INTERVAL_MAX_MS);
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
