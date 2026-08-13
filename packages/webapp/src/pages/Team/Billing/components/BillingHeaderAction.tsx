import { ExternalLink } from 'lucide-react';

import { Button } from '@nangohq/design-system';

import { ButtonLink } from '@/components/ui/ButtonLink';
import { useApiGetBillingUsage, useCurrentPlan } from '@/hooks/usePlan';
import { useStore } from '@/store';
import { track } from '@/utils/analytics';

/**
 * Primary action in the Billing & usage page header: Free upgrades, everyone else goes to their
 * invoices (Figma nodes 574:44366 and 563:50025).
 */
export const BillingHeaderAction: React.FC = () => {
    const env = useStore((state) => state.env);
    const { data: environmentData } = useCurrentPlan(env);
    const plan = environmentData?.plan;
    const isFree = plan?.name === 'free';

    // Same query key as <Payment/>'s unfiltered call, so this shares that request instead of adding
    // one. Free has no Orb customer, so skip it entirely — and wait for `plan` to resolve, since
    // until it does `isFree` is false and we'd fire a request for a Free account.
    const { data: usage } = useApiGetBillingUsage(env, undefined, { enabled: plan != null && !isFree });
    const portalUrl = usage?.data.customer.portalUrl;

    if (!plan) {
        return null;
    }

    if (isFree) {
        const scrollToPlans = () => {
            track('web:usage:upgrade_clicked', {});
            document.getElementById('plans')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };

        return (
            <Button size="md" onClick={scrollToPlans}>
                Upgrade
            </Button>
        );
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
