import { CreditCard } from 'lucide-react';
import { useMemo } from 'react';

import { InvoicingDetailsForm } from './InvoicingDetailsForm';
import { PaymentMethodDialog } from './PaymentMethodDialog';
import { Dot } from '../../../../components-v2/Dot';
import { CriticalErrorAlert } from '@/components-v2/CriticalErrorAlert';
import { StyledLink } from '@/components-v2/StyledLink';
import { Button } from '@/components-v2/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components-v2/ui/card';
import { Skeleton } from '@/components-v2/ui/skeleton';
import { useApiGetBillingUsage } from '@/hooks/usePlan';
import { useStripePaymentMethods } from '@/hooks/useStripe';
import { useStore } from '@/store';

export const Payment: React.FC = () => {
    const env = useStore((state) => state.env);
    const { data: usage, isLoading: isUsageLoading, error: usageError } = useApiGetBillingUsage(env);
    const { data: paymentMethods, isLoading: isPaymentMethodsLoading, error: paymentMethodsError } = useStripePaymentMethods(env);

    const paymentMethod = useMemo(() => {
        return paymentMethods?.data && paymentMethods.data.length > 0 ? paymentMethods.data[0] : null;
    }, [paymentMethods]);

    return (
        <div className="flex-1 flex flex-col gap-8">
            <div className="flex flex-col gap-5">
                <h3 className="text-body-small-regular text-text-secondary">PAYMENT</h3>
                <Card className="bg-bg-surface rounded border-2 border-border-disabled py-0 gap-0">
                    <CardHeader className="bg-bg-elevated h-10 flex items-center px-6">
                        <CardTitle className="text-text-primary !text-heading-sm">Payment method</CardTitle>
                    </CardHeader>
                    <CardContent className="px-6 py-9">
                        {isPaymentMethodsLoading ? (
                            <Skeleton className="w-full h-22.5" />
                        ) : paymentMethodsError ? (
                            <CriticalErrorAlert message="Error loading payment method" />
                        ) : (
                            <div className="w-full inline-flex items-center justify-between">
                                <div className="inline-flex gap-3 items-center">
                                    <div className="size-10 flex items-center justify-center border border-border-muted rounded">
                                        <CreditCard className="size-4.5 text-icon-primary" />
                                    </div>
                                    <div className="flex flex-col">
                                        <div className="inline-flex gap-1.5 items-center">
                                            <span className="text-text-primary text-sm leading-5 font-semibold">Credit Card</span>
                                            <Dot variant={paymentMethod ? 'brand' : 'error'} />
                                        </div>
                                        <span className="text-text-tertiary text-s leading-5 font-medium">
                                            {paymentMethod ? `Card ending in ${paymentMethod?.last4}` : 'No card added'}
                                        </span>
                                    </div>
                                </div>
                                <PaymentMethodDialog replace={!!paymentMethod}>
                                    <Button size={'sm'} className="min-w-27">
                                        {paymentMethod ? 'Update' : 'Add payment method'}
                                    </Button>
                                </PaymentMethodDialog>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            <div className="flex flex-col gap-5">
                <div className="flex items-center justify-between">
                    <h3 className="text-body-small-regular text-text-secondary">INVOICING</h3>
                    {!usageError &&
                        (isUsageLoading ? (
                            <Skeleton className="w-27 h-5" />
                        ) : (
                            usage?.data.customer.portalUrl && (
                                <StyledLink to={usage.data.customer.portalUrl} icon type="external">
                                    View invoices
                                </StyledLink>
                            )
                        ))}
                </div>

                {usageError ? <CriticalErrorAlert message="Error loading invoicing details" /> : <InvoicingDetailsForm customer={usage?.data.customer} />}
            </div>
        </div>
    );
};
