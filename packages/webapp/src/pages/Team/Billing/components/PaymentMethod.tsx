import { CheckoutProvider, PaymentElement, useCheckout } from '@stripe/react-stripe-js';
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

    const fetchClientSecret = useCallback(async () => {
        // Create a Checkout Session
        return ((await apiPostStripeCollectPayment(env)).json as PostStripeCollectPayment['Success']).data.secret;
    }, []);

    const card = useMemo<string | null>(() => {
        if (!data || !data.data || data.data.length <= 0 || !data.data[0]) {
            return null;
        }
        return data.data[0];
    }, [data]);

    return (
        <div className="flex">
            {isLoading ? (
                <Skeleton className="w-[250px]" />
            ) : (
                <>
                    {card && (
                        <div className="text-sm text-white flex gap-2 items-center">
                            <IconCreditCard />
                            <div>
                                Card ending in <span className="font-code">{card}</span>
                            </div>
                        </div>
                    )}
                </>
            )}

            <CheckoutProvider
                stripe={stripePromise}
                options={{
                    fetchClientSecret,

                    elementsOptions: {
                        loader: 'always',
                        appearance: {
                            labels: 'floating',
                            variables: {
                                // colorPrimary: '#fff',
                                // colorBackground: '#111111',
                                // colorText: '#fff',
                                focusBoxShadow: 'transparent',
                                fontFamily: 'Inter, system-ui, sans-serif',
                                spacingUnit: '4px'
                            }
                        }
                    }
                }}
            >
                <CreditCardForm />
            </CheckoutProvider>
        </div>
    );
};

const CreditCardForm: React.FC = () => {
    const checkout = useCheckout();
    const { toast } = useToast();

    const env = useStore((state) => state.env);
    const { data, isLoading } = useStripePaymentMethods(env);

    const [loading, setLoading] = useState(false);

    const card = useMemo<string | null>(() => {
        if (!data || !data.data || data.data.length <= 0 || !data.data[0]) {
            return null;
        }
        return data.data[0];
    }, [data]);

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

    if (isLoading) {
        return <Skeleton className="w-[250px]" />;
    }

    if (card) {
        return;
    }

    return (
        <div className="h-20">
            <Dialog>
                <DialogTrigger asChild>
                    <Button size={'xs'}>
                        <IconCreditCard /> Add payment method
                    </Button>
                </DialogTrigger>

                <DialogContent className="w-[550px] min-h-[510px]">
                    <DialogTitle>Add payment method</DialogTitle>

                    <form onSubmit={handleSubmit}>
                        <PaymentElement />
                        <div className="mt-4 justify-end flex gap-4">
                            <DialogClose asChild>
                                <Button variant="secondary">Cancel</Button>
                            </DialogClose>

                            <Button isLoading={loading} variant={'primary'}>
                                Save Payment Method
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
};
