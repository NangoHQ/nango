import { useCallback, useState } from 'react';

import { Alert, AlertDescription } from '@nangohq/design-system';

import { CriticalErrorAlert } from '@/components/patterns/CriticalErrorAlert';
import { environmentQueryKey } from '@/hooks/useEnvironment';
import { useApiPostPlanChange } from '@/hooks/usePlan';
import { useToast } from '@/hooks/useToast.js';
import { queryClient } from '@/store';
import { stripePromise } from '@/utils/stripe.js';

import type { StripeError } from '@/utils/stripe.js';

interface PlanChangeRequest {
    orbId: string;
    withGrowthFeatures: boolean;
    successTitle: string;
}

const REFRESH_DEADLINE_MS = 5_000;

/** A `card_error` carries a message worth showing; anything else is noise to the customer. */
function stripeCardError(error: StripeError): string {
    return error.type === 'card_error'
        ? (error.message ?? 'An error occurred while validating your payment.')
        : 'An error occurred while validating your payment.';
}

export function usePlanChangeRequest(env: string) {
    const { mutateAsync: postPlanChange } = useApiPostPlanChange(env);
    const { toast } = useToast();

    const [loading, setLoading] = useState(false);
    // `critical` marks the failures retrying never helps: a declined card is the customer's to act on.
    const [error, setError] = useState<{ message: string; critical: boolean } | null>(null);

    const fail = useCallback((message: string, critical: boolean) => {
        setLoading(false);
        setError({ message, critical });
        return false;
    }, []);

    const finish = useCallback(
        async (successTitle: string) => {
            const refreshed = Promise.all([
                queryClient.invalidateQueries({ exact: false, queryKey: ['plans'], type: 'all' }),
                queryClient.invalidateQueries({ queryKey: environmentQueryKey(env) })
            ]);
            await raceDeadline(refreshed, Date.now() + REFRESH_DEADLINE_MS);
            setLoading(false);
            toast({ title: successTitle, variant: 'success' });
        },
        [env, toast]
    );

    const submit = useCallback(
        async ({ orbId, withGrowthFeatures, successTitle }: PlanChangeRequest): Promise<boolean> => {
            setLoading(true);
            setError(null);

            let json: Awaited<ReturnType<typeof postPlanChange>>;
            try {
                json = await postPlanChange({ orbId, withGrowthFeatures });
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

            await finish(successTitle);
            return true;
        },
        [fail, finish, postPlanChange]
    );

    const reset = useCallback(() => setError(null), []);

    return { submit, reset, loading, error };
}

async function raceDeadline(promise: Promise<unknown>, deadline: number): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, Math.max(0, deadline - Date.now()));
    });
    try {
        await Promise.race([promise, expired]);
    } finally {
        clearTimeout(timer);
    }
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
