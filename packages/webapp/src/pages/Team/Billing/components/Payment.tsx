import { Pencil } from 'lucide-react';
import { useMemo } from 'react';

import { Button, Card } from '@nangohq/design-system';

import { CriticalErrorAlert } from '@/components/patterns/CriticalErrorAlert';
import { Skeleton } from '@/components/ui/Skeleton';
import { StyledLink } from '@/components/ui/StyledLink';
import { useApiGetBillingUsage } from '@/hooks/usePlan';
import { useStripePaymentMethods } from '@/hooks/useStripe';
import { useStore } from '@/store';
import { InvoicingDetailsForm } from './InvoicingDetailsForm';
import { PaymentMethodDialog } from './PaymentMethodDialog';

export const Payment: React.FC = () => {
    const env = useStore((state) => state.env);
    const { data: usage, isLoading: isUsageLoading, error: usageError } = useApiGetBillingUsage(env);
    const { data: paymentMethods, isLoading: isPaymentMethodsLoading, error: paymentMethodsError } = useStripePaymentMethods(env);

    const paymentMethod = useMemo(() => {
        return paymentMethods?.data && paymentMethods.data.length > 0 ? paymentMethods.data[0] : null;
    }, [paymentMethods]);

    return (
        <div className="flex-1 flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <span className="text-text-strong text-body-medium-medium">Billing information</span>
                {!usageError &&
                    (isUsageLoading ? (
                        <Skeleton className="w-27 h-5" />
                    ) : (
                        usage?.data.customer.portalUrl && (
                            <StyledLink to={usage.data.customer.portalUrl} icon type="external">
                                View all invoices
                            </StyledLink>
                        )
                    ))}
            </div>

            <Card>
                <div className="p-4 flex items-start justify-between">
                    {isPaymentMethodsLoading ? (
                        <Skeleton className="w-full h-14" />
                    ) : paymentMethodsError ? (
                        <CriticalErrorAlert message="Error loading payment method" />
                    ) : (
                        <>
                            <div className="flex flex-col gap-1">
                                <span className="text-text-strong text-ds-lg font-ds-medium leading-ds-snug tracking-ds-tight">Payment method</span>
                                {paymentMethod ? (
                                    <>
                                        <span className="text-text-secondary text-body-small-regular capitalize">
                                            {paymentMethod.brand}···{paymentMethod.last4}
                                        </span>
                                        <span className="text-text-secondary text-body-small-regular">
                                            Valid until {String(paymentMethod.expMonth).padStart(2, '0')}/{String(paymentMethod.expYear).slice(-2)}
                                        </span>
                                    </>
                                ) : (
                                    <span className="text-text-secondary text-body-small-regular">No card added</span>
                                )}
                            </div>
                            <PaymentMethodDialog replace={!!paymentMethod}>
                                <Button size="md">
                                    {paymentMethod ? (
                                        <>
                                            <Pencil /> Edit
                                        </>
                                    ) : (
                                        'Add payment method'
                                    )}
                                </Button>
                            </PaymentMethodDialog>
                        </>
                    )}
                </div>

                {usageError ? (
                    <div className="border-t border-border-muted p-4">
                        <CriticalErrorAlert message="Error loading invoicing details" />
                    </div>
                ) : (
                    <InvoicingDetailsForm customer={usage?.data.customer} />
                )}
            </Card>
        </div>
    );
};
