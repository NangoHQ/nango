import { AddressElement, Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { Loader } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components-v2/ui/button';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components-v2/ui/dialog';
import { Skeleton } from '@/components-v2/ui/skeleton';
import { apiPostStripeCollectPayment } from '@/hooks/useStripe';
import { useToast } from '@/hooks/useToast';
import { queryClient, useStore } from '@/store';
import { stripePromise } from '@/utils/stripe';

import type { PostStripeCollectPayment } from '@nangohq/types';

export const PaymentMethodDialog: React.FC<{
    replace?: boolean;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    onSuccess?: () => void;
    children?: React.ReactElement;
}> = ({ replace, open: openProp, onOpenChange, onSuccess, children }) => {
    const env = useStore((state) => state.env);

    const [clientSecret, setClientSecret] = useState<string | null>(null);

    const [internalOpen, setInternalOpen] = useState(false);
    const isControlled = openProp !== undefined;
    const open = isControlled ? openProp : internalOpen;
    const setOpen = useCallback(
        (value: boolean) => {
            if (!isControlled) {
                setInternalOpen(value);
            }
            onOpenChange?.(value); // always notify parent
        },
        [isControlled, onOpenChange]
    );

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
            {/* {children && <DialogTrigger asChild>{children}</DialogTrigger>} */}
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{replace ? 'Update' : 'Add'} payment method</DialogTitle>
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
                        <PaymentMethodForm
                            onSuccess={() => {
                                handleDialogOpenChange(false);
                                onSuccess?.();
                            }}
                        />
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

const PaymentMethodForm: React.FC<{ onSuccess: () => void }> = ({ onSuccess }) => {
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
