import { AddressElement, Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { CircleX, Loader } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';

import {
    Alert,
    AlertDescription,
    Button,
    Dialog,
    DialogBody,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from '@nangohq/design-system';

import { Skeleton } from '@/components/ui/Skeleton';
import { GetOverdueInvoicesQueryKey } from '@/hooks/usePlan';
import { usePostStripeCollectPayment } from '@/hooks/useStripe';
import { useToast } from '@/hooks/useToast';
import { darkModeSelector, useThemeStore } from '@/lib/theme';
import { queryClient, useStore } from '@/store';
import { stripePromise } from '@/utils/stripe';

export const PaymentMethodDialog: React.FC<{
    replace?: boolean;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    onSuccess?: () => void;
    children?: React.ReactElement;
}> = ({ replace, open: openProp, onOpenChange, onSuccess, children }) => {
    const env = useStore((state) => state.env);
    const darkMode = useThemeStore(darkModeSelector);

    const { mutate: collectPayment, data: collectPaymentData, status: collectPaymentStatus, reset: resetCollectPayment } = usePostStripeCollectPayment(env);
    const clientSecret = collectPaymentData?.data.secret ?? null;

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
        if (!open) {
            resetCollectPayment();
        } else if (collectPaymentStatus === 'idle') {
            collectPayment();
        }
    }, [open, collectPaymentStatus, collectPayment, resetCollectPayment]);

    const handleDialogOpenChange = (newOpen: boolean) => {
        setOpen(newOpen);
    };

    return (
        <Dialog open={open} onOpenChange={handleDialogOpenChange}>
            {/* {children && <DialogTrigger asChild>{children}</DialogTrigger>} */}
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{replace ? 'Update' : 'Add'} payment method</DialogTitle>
                    <DialogDescription className="sr-only">{replace ? 'Update your payment method' : 'Add a new payment method'}</DialogDescription>
                </DialogHeader>
                {clientSecret ? (
                    <Elements
                        stripe={stripePromise}
                        options={{
                            loader: 'always',
                            appearance: {
                                labels: 'floating',
                                variables: darkMode
                                    ? {
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
                                    : {
                                          colorPrimary: '#016886',
                                          borderRadius: '4px',
                                          colorTextPlaceholder: '#a1a2a5',
                                          colorTextSecondary: '#626366',
                                          colorBackground: '#ffffff',
                                          colorText: '#18191b',
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
                ) : collectPaymentStatus === 'error' ? (
                    <DialogBody>
                        <div className="flex flex-col gap-4">
                            <Alert variant="danger">
                                <CircleX />
                                <AlertDescription>Couldn&apos;t load the payment form.</AlertDescription>
                            </Alert>
                            <div className="flex justify-end">
                                <Button type="button" onClick={() => collectPayment()}>
                                    Try again
                                </Button>
                            </div>
                        </div>
                    </DialogBody>
                ) : (
                    <DialogBody>
                        <div className="flex flex-col gap-4">
                            <Skeleton className="w-full h-13 bg-surface-panel-inset" />
                            <Skeleton className="w-full h-13 bg-surface-panel-inset" />
                            <Skeleton className="w-full h-13 bg-surface-panel-inset" />
                            <Skeleton className="w-full h-13 bg-surface-panel-inset" />
                            <Skeleton className="w-full h-13 bg-surface-panel-inset" />
                            <Skeleton className="w-full h-13 bg-surface-panel-inset" />
                        </div>
                    </DialogBody>
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
            // Orb retries the charge against the new card, so re-check rather than leaving the
            // overdue alert telling them to do what they just did.
            await queryClient.invalidateQueries({ queryKey: GetOverdueInvoicesQueryKey });
            onSuccess();
        }

        setLoading(false);
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col">
            <DialogBody>
                <div className="flex flex-col gap-4 max-h-[70vh] min-h-80 overflow-y-auto overflow-x-hidden flex-1">
                    <PaymentElement />
                    <AddressElement options={{ mode: 'billing' }} />
                </div>
            </DialogBody>
            <DialogFooter>
                <DialogClose asChild>
                    <Button variant="outline" size="lg">
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
