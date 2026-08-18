import { ExternalLink } from 'lucide-react';

import { ButtonLink } from '@/components/ui/ButtonLink';
import { Skeleton } from '@/components/ui/Skeleton';
import { useApiGetBillingUsage, useCurrentPlan } from '@/hooks/usePlan';
import { useStore } from '@/store';
import { track } from '@/utils/analytics';

/**
 * Primary action in the Billing & usage page header: paid accounts go to their invoices, Free has
 * no header action (its upgrade CTAs live in the usage banner and the plan cards).
 */
export const BillingHeaderAction: React.FC = () => {
    const env = useStore((state) => state.env);
    const { data: environmentData, isLoading: isPlanLoading } = useCurrentPlan(env);
    const plan = environmentData?.plan;
    const isFree = plan?.name === 'free';

    // Same query key as <Payment/>'s unfiltered call, so this shares that request instead of adding
    // one. Free has no Orb customer, so skip it entirely — and wait for `plan` to resolve, since
    // until it does `isFree` is false and we'd fire a request for a Free account.
    const { data: usage, isLoading: isUsageLoading } = useApiGetBillingUsage(env, undefined, { enabled: plan != null && !isFree });
    const portalUrl = usage?.data.customer.portalUrl;

    // Both the plan and (for paid) the portal URL are fetched, so hold a button-sized placeholder
    // rather than letting the header sit empty and pop the button in a moment later. Only while a
    // request is in flight though — on error there's no action to show, so don't pulse forever.
    if (!plan) {
        return isPlanLoading ? <Skeleton className="h-8 w-28" /> : null;
    }

    if (isFree) {
        return null;
    }

    if (isUsageLoading) {
        return <Skeleton className="h-8 w-28" />;
    }

    if (!portalUrl) {
        return null;
    }

    return (
        <ButtonLink to={portalUrl} size="md" target="_blank" rel="noopener noreferrer" onClick={() => track('web:usage:invoice_details_clicked', {})}>
            All invoices
            <ExternalLink />
        </ButtonLink>
    );
};
