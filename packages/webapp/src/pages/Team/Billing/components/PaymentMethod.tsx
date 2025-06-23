import { AddressElement, CheckoutProvider, PaymentElement, useCheckout } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { IconCreditCard, IconTrash } from '@tabler/icons-react';
import { useCallback, useMemo, useState } from 'react';

import { ConfirmModal } from '../../../../components/ConfirmModal';
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from '../../../../components/ui/Dialog';
import { Skeleton } from '../../../../components/ui/Skeleton';
import { Button } from '../../../../components/ui/button/Button';
import { apiDeleteStripePayment, apiPostStripeCollectPayment, useStripePaymentMethods } from '../../../../hooks/useStripe';
import { useToast } from '../../../../hooks/useToast';
import { queryClient, useStore } from '../../../../store';

import type { PostStripeCollectPayment } from '@nangohq/types';

const stripePromise = loadStripe('pk_test_51MVv8QEqOjlnWXac73bmtaUlg8BLCGGmliw6pmRg02AXF6j2AUhpkVYOUOnJdtpmTD1Lz6P2C6B5jmLRh4J4ayfN000S3OQSAX');

export const PaymentMethods: React.FC = () => {
    const env = useStore((state) => state.env);
    const { data, isLoading } = useStripePaymentMethods(env);

    const hasCard = useMemo<boolean>(() => {
        if (!data || !data.data || data.data.length <= 0) {
            return false;
        }
        return true;
    }, [data]);

    if (isLoading) {
        return <Skeleton className="w-[250px] h-8" />;
    }

    if (!hasCard) {
        return <CreditCardButton />;
    }

    return (
        <div className="flex gap-8">
            {data?.data.map((card) => {
                return <PaymentMethod key={card.id} {...card} />;
            })}
        </div>
    );
};

const PaymentMethod: React.FC<{ id: string; last4: string }> = ({ id, last4 }) => {
    const { toast } = useToast();
    const env = useStore((state) => state.env);

    const [loading, setLoading] = useState(false);
    const onDelete = useCallback(async () => {
        setLoading(true);

        const created = await apiDeleteStripePayment(env, id);

        if ('error' in created.json) {
            toast({ title: created.json.error.message || 'Failed to delete payment', variant: 'error' });
        } else {
            await queryClient.invalidateQueries({ queryKey: ['stripe', 'payment_methods'] });
            toast({ title: 'Payment method deleted', variant: 'success' });
        }
        setLoading(false);
    }, [id]);

    return (
        <div className="relative flex bg-grayscale-4 w-[300px] py-6 px-5 rounded">
            <div className="absolute right-2 top-2">
                <ConfirmModal
                    title="Delete payment method"
                    description="This action is destructive & irreversible. Are you sure you want to delete your payment method?"
                    confirmButtonText="Delete Payment Method"
                    trigger={
                        <Button variant={'icon'} size="xs" isLoading={loading}>
                            <IconTrash size={16} />
                        </Button>
                    }
                    loading={loading}
                    onConfirm={onDelete}
                />
            </div>
            <div className="text-sm text-white flex gap-4 items-start">
                <div className="bg-grayscale-14 text-grayscale-4 w-10 h-10 rounded flex items-center justify-center">
                    <IconCreditCard size={30} stroke={1} />
                </div>
                <div className="flex flex-col gap-1">
                    <div>Credit Card</div>
                    <div className="text-grayscale-11 text-s">Card ending in {last4}</div>
                </div>
            </div>
        </div>
    );
};

const CreditCardButton: React.FC = () => {
    const env = useStore((state) => state.env);

    const fetchClientSecret = useCallback(async () => {
        // Create a Checkout Session
        return ((await apiPostStripeCollectPayment(env)).json as PostStripeCollectPayment['Success']).data.secret;
    }, []);

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
