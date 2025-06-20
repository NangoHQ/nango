import { AddressElement, CheckoutProvider, PaymentElement, useCheckout } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { IconCreditCard } from '@tabler/icons-react';
import { useCallback, useMemo, useState } from 'react';

import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from '../../../../components/ui/Dialog';
import { Skeleton } from '../../../../components/ui/Skeleton';
import { Button } from '../../../../components/ui/button/Button';
import { apiPostStripeCollectPayment, useStripePaymentMethods } from '../../../../hooks/useStripe';
import { useToast } from '../../../../hooks/useToast';
import { useStore } from '../../../../store';

import type { PostStripeCollectPayment } from '@nangohq/types';

const stripePromise = loadStripe('pk_test_51MVv8QEqOjlnWXac73bmtaUlg8BLCGGmliw6pmRg02AXF6j2AUhpkVYOUOnJdtpmTD1Lz6P2C6B5jmLRh4J4ayfN000S3OQSAX');

export const PaymentMethod: React.FC = () => {
    const env = useStore((state) => state.env);

    const { data, isLoading } = useStripePaymentMethods(env);

    const card = useMemo<string | null>(() => {
        if (!data || !data.data || data.data.length <= 0 || !data.data[0]) {
            return null;
        }
        return data.data[0];
    }, [data]);

    return (
        <div className="flex">
            {isLoading ? (
                <Skeleton className="w-[250px] h-8" />
            ) : (
                <>
                    {card && (
                        <div className="text-sm text-white flex gap-4 items-start">
                            <IconCreditCard size={30} />
                            <div className="flex flex-col gap-1">
                                <div>Card ending in</div>
                                <div className="font-code text-grayscale-11">**** {card}</div>
                            </div>
                        </div>
                    )}
                    <CreditCardButton />
                </>
            )}
        </div>
    );
};

const CreditCardButton: React.FC = () => {
    const env = useStore((state) => state.env);
    const { data } = useStripePaymentMethods(env);

    const card = useMemo<string | null>(() => {
        if (!data || !data.data || data.data.length <= 0 || !data.data[0]) {
            return null;
        }
        return data.data[0];
    }, [data]);

    const fetchClientSecret = useCallback(async () => {
        // Create a Checkout Session
        return ((await apiPostStripeCollectPayment(env)).json as PostStripeCollectPayment['Success']).data.secret;
    }, []);

    if (card) {
        return;
    }

    return (
        <div className="h-20">
            <Dialog>
                <DialogTrigger asChild>
                    <Button size={'sm'}>
                        <IconCreditCard /> Add payment method
                    </Button>
                </DialogTrigger>

                <DialogContent className="w-[550px] min-h-[510px]">
                    <DialogTitle>Add payment method</DialogTitle>

                    <CheckoutProvider
                        stripe={stripePromise}
                        options={{
                            fetchClientSecret,
                            elementsOptions: {
                                loader: 'always',
                                appearance: {
                                    labels: 'floating',
                                    variables: {
                                        colorPrimary: '#fff',
                                        borderRadius: '4px',
                                        colorTextPlaceholder: '#737473',
                                        colorTextSecondary: '#737473',
                                        colorBackground: '#262626',
                                        colorText: '#fff',
                                        focusBoxShadow: 'transparent',
                                        fontFamily: 'Inter, system-ui, sans-serif',
                                        fontSizeSm: '11px',
                                        fontSizeBase: '12px',
                                        spacingUnit: '3px'
                                    }
                                }
                            }
                        }}
                    >
                        <CreditCardForm />
                    </CheckoutProvider>
                </DialogContent>
            </Dialog>
        </div>
    );
};

const CreditCardForm: React.FC = () => {
    const checkout = useCheckout();
    const { toast } = useToast();

    const [loading, setLoading] = useState(false);

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
        e.preventDefault();

        setLoading(true);

        const confirmResult = await checkout.confirm();
        if (confirmResult.type === 'error') {
            toast({ title: confirmResult.error.message, variant: 'error' });
        }

        setLoading(false);
    };

    return (
        <form onSubmit={handleSubmit}>
            <div className="flex flex-col gap-4">
                <PaymentElement />
                <AddressElement options={{ mode: 'billing' }} />
            </div>
            <div className="mt-4 justify-end flex gap-4">
                <DialogClose asChild>
                    <Button variant="secondary">Cancel</Button>
                </DialogClose>

                <Button isLoading={loading} variant={'primary'}>
                    Save Payment Method
                </Button>
            </div>
        </form>
    );
};
