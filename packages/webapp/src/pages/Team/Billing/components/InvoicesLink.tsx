import { ArrowUpRight } from 'lucide-react';

import { LinkButton } from '@nangohq/design-system';

import { Skeleton } from '@/components/ui/Skeleton';
import { useApiGetBillingUsage, useCurrentPlan } from '@/hooks/usePlan';
import { useStore } from '@/store';
import { track } from '@/utils/analytics';
import { isBilledPlan } from '../planVisibility';

export const InvoicesLink: React.FC = () => {
    const env = useStore((state) => state.env);
    const { data: environmentData, isLoading: isPlanLoading } = useCurrentPlan(env);
    const plan = environmentData?.plan;
    // False until the plan resolves, so an unbilled account never fires the request below.
    const isBilled = isBilledPlan(plan);

    // Same query key as <Payment/>'s unfiltered call, so this shares that request instead of adding one.
    const { data: usage, isLoading: isUsageLoading } = useApiGetBillingUsage(env, undefined, { enabled: isBilled });
    const portalUrl = usage?.data.customer.portalUrl;

    if (!plan) {
        return isPlanLoading ? <Skeleton className="h-5 w-24" /> : null;
    }

    if (!isBilled) {
        return null;
    }

    if (isUsageLoading) {
        return <Skeleton className="h-5 w-24" />;
    }

    if (!portalUrl) {
        return null;
    }

    return (
        <LinkButton asChild size="lg">
            <a href={portalUrl} target="_blank" rel="noopener noreferrer" onClick={() => track('billing:invoice_link_click', {})}>
                All invoices
                <ArrowUpRight />
            </a>
        </LinkButton>
    );
};
