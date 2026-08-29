import { Card } from '@nangohq/design-system';

import { CriticalErrorAlert } from '@/components/patterns/CriticalErrorAlert';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatMoneyFromCents } from '../money';

/** Actions are passed in so the section renders outside the app. */
export const SpendAlertsSection: React.FC<{
    thresholdInCents: number | null;
    currency: string | null;
    isPending?: boolean;
    isError?: boolean;
    addAction?: React.ReactNode;
    rowActions?: React.ReactNode;
}> = ({ thresholdInCents, currency, isPending = false, isError = false, addAction, rowActions }) => {
    const isSettled = !isPending && !isError;

    return (
        <div className="flex-1 flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                    <h3 className="text-text-strong text-body-medium-medium">Spend alerts</h3>
                    <span className="text-text-secondary text-body-small-regular">
                        Sent to your billing email and account admins when spend crosses a threshold.
                    </span>
                </div>
                {isSettled && thresholdInCents === null && addAction}
            </div>

            {isPending ? (
                <Skeleton className="w-full h-11" />
            ) : isError ? (
                <CriticalErrorAlert message="Error loading spend alerts" />
            ) : (
                thresholdInCents !== null && (
                    <Card>
                        <div className="p-3 flex items-center justify-between gap-4">
                            <span className="text-text-strong text-body-medium-regular">
                                {/* Without a currency there's no symbol, but the amount is still what the customer set. */}
                                {formatMoneyFromCents(thresholdInCents, currency) ?? (thresholdInCents / 100).toFixed(2)}
                            </span>
                            <div className="flex items-center gap-1">{rowActions}</div>
                        </div>
                    </Card>
                )
            )}
        </div>
    );
};
