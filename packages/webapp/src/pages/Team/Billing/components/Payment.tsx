import { AddressElement, Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { CreditCard, Loader } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Dot } from './Dot';
import { StyledLink } from '@/components-v2/StyledLink';
import { Button } from '@/components-v2/ui/button';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components-v2/ui/dialog';
import { Skeleton } from '@/components-v2/ui/skeleton';
import { useApiGetBillingUsage } from '@/hooks/usePlan';
import { apiPostStripeCollectPayment, useStripePaymentMethods } from '@/hooks/useStripe';
import { useToast } from '@/hooks/useToast';
import { queryClient, useStore } from '@/store';
import { stripePromise } from '@/utils/stripe';

import type { PostStripeCollectPayment } from '@nangohq/types';

export const Payment: React.FC = () => {
    const env = useStore((state) => state.env);
    const { data: usage, isLoading: isUsageLoading } = useApiGetBillingUsage(env);
    const { data: paymentMethods, isLoading: isPaymentMethodsLoading } = useStripePaymentMethods(env);

    const paymentMethod = useMemo(() => {
        return paymentMethods?.data && paymentMethods.data.length > 0 ? paymentMethods.data[0] : null;
    }, [paymentMethods]);

    return (
        <div className="flex flex-col gap-8">
            {isPaymentMethodsLoading ? (
                <Skeleton className="w-full h-22.5" />
            ) : (
                <div className="w-full inline-flex items-center justify-between px-5 py-6 rounded border border-border-muted">
                    <div className="inline-flex gap-3 items-center">
                        <div className="size-10 flex items-center justify-center border border-border-muted rounded">
                            <CreditCard className="size-4.5 text-icon-primary" />
                        </div>
                        <div className="flex flex-col">
                            <div className="inline-flex gap-1.5 items-center">
                                <span className="text-text-primary text-sm leading-5 font-semibold">Credit Card</span>
                                <Dot />
                            </div>
                            <span className="text-text-tertiary text-s leading-5 font-medium">Card ending in {paymentMethod?.last4}</span>
                        </div>
                    </div>
                    <PaymentFormDialog />
                </div>
            )}

            {isUsageLoading ? (
                <Skeleton className="w-27 h-5" />
            ) : (
                usage?.data.customer.portalUrl && (
                    <StyledLink to={usage.data.customer.portalUrl} icon type="external">
                        View invoices
                    </StyledLink>
                )
            )}
        </div>
    );
};

const PaymentFormDialog: React.FC = () => {
    const env = useStore((state) => state.env);

    const [open, setOpen] = useState(false);
    const [clientSecret, setClientSecret] = useState<string | null>(null);

    useEffect(() => {
        if (open && !clientSecret) {
            const fetchClientSecret = async () => {
                const secret = ((await apiPostStripeCollectPayment(env)).json as PostStripeCollectPayment['Success']).data.secret;
                setClientSecret(secret);
            };
            void fetchClientSecret();
        }
    }, [open, clientSecret, env]);

    const handleDialogOpenChange = (newOpen: boolean) => {
        setOpen(newOpen);
        if (newOpen) {
            // Reset client secret when opening dialog
            setClientSecret(null);
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleDialogOpenChange}>
            <DialogTrigger asChild>
                <Button size={'sm'} className="w-27">
                    Update
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Add payment method</DialogTitle>
                </DialogHeader>
                {clientSecret ? (
                    <Elements
                        stripe={stripePromise}
                        options={{
                            loader: 'always',
                            appearance: {
                                labels: 'floating',
                                variables: {
                                    colorPrimary: '#00b2e3',
                                    borderRadius: '4px',
                                    colorTextPlaceholder: '#8b8c8f',
                                    colorTextSecondary: '#c4c5c7',
                                    colorBackground: '#18191b',
                                    colorText: '#fff',
                                    focusBoxShadow: 'transparent',
                                    fontFamily: 'Inter, system-ui, sans-serif',
                                    fontSizeSm: '12px',
                                    fontSizeBase: '14px',
                                    spacingUnit: '4px'
                                }
                            },
                            clientSecret
                        }}
                    >
                        <PaymentForm onSuccess={() => handleDialogOpenChange(false)} />
                    </Elements>
                ) : (
                    <div className="flex flex-col gap-4">
                        <Skeleton className="w-full h-13 bg-bg-subtle" />
                        <Skeleton className="w-full h-13 bg-bg-subtle" />
                        <Skeleton className="w-full h-13 bg-bg-subtle" />
                        <Skeleton className="w-full h-13 bg-bg-subtle" />
                        <Skeleton className="w-full h-13 bg-bg-subtle" />
                        <Skeleton className="w-full h-13 bg-bg-subtle" />
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};

const PaymentForm: React.FC<{ onSuccess: () => void }> = ({ onSuccess }) => {
    const stripe = useStripe();
    const elements = useElements();
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
        e.preventDefault();

        setLoading(true);

        if (!stripe || !elements) {
            toast({ title: 'Stripe not loaded', variant: 'error' });
            setLoading(false);
            return;
        }

        const result = await stripe.confirmSetup({
            elements,
            confirmParams: {
                // No return_url to avoid redirect
            },
            redirect: 'if_required'
        });

        if (result.error) {
            toast({ title: result.error.message, variant: 'error' });
        } else {
            toast({ title: 'Payment method added', variant: 'success' });
            await queryClient.invalidateQueries({ queryKey: ['stripe'] });
            onSuccess();
        }

        setLoading(false);
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-10">
            <div className="flex flex-col gap-4 max-h-[70vh] min-h-80 overflow-y-auto overflow-x-hidden flex-1">
                <PaymentElement />
                <AddressElement options={{ mode: 'billing' }} />
            </div>
            <DialogFooter>
                <DialogClose asChild>
                    <Button variant="secondary" size="lg">
                        Cancel
                    </Button>
                </DialogClose>
                <Button type="submit" disabled={loading} variant={'primary'} size="lg">
                    {loading && <Loader className="animate-spin" />}
                    Save payment method
                </Button>
            </DialogFooter>
        </form>
    );
};
