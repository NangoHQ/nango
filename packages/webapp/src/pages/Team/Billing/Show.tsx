import { useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { useLocation } from 'react-router-dom';

import { permissions } from '@nangohq/authz';

import { Separator } from '@/components/ui/Separator';
import { usePermissions } from '@/hooks/usePermissions';
import { track } from '@/utils/analytics';
import DashboardLayout from '../../../layout/DashboardLayout';
import { BillingHeaderAction } from './components/BillingHeaderAction';
import { Payment } from './components/Payment';
import { Plans } from './components/Plans';
import { Usage } from './components/Usage';

export const TeamBilling: React.FC = () => {
    const { can } = usePermissions();
    const canManageBilling = can(permissions.canManageBilling);

    useEffect(() => {
        track('web:usage:viewed', {});
    }, []);

    // The 3 sections used to be separate tabs reachable via #usage/#plans/#payment-and-invoices
    // (still linked from other pages). Now that they're stacked on one page, scroll to the matching
    // section instead of switching tabs.
    const location = useLocation();
    useEffect(() => {
        const hash = location.hash.slice(1);
        if (!hash) {
            return;
        }
        document.getElementById(hash)?.scrollIntoView({ block: 'start' });
    }, [location.hash]);

    // Full-width page shell keeps chrome consistent with the other dashboard pages, but `centered`
    // caps the content: the usage charts have a fixed height, so unbounded width stretches them to an
    // unreadable aspect ratio on wide screens.
    return (
        <DashboardLayout fullWidth centered title="Billing & usage" titleActions={<BillingHeaderAction />}>
            <Helmet>
                <title>Billing & usage - Nango</title>
            </Helmet>
            <div className="flex flex-col gap-8">
                <div id="usage">
                    <Usage />
                </div>
                <Separator />
                <div id="plans" className="flex flex-col gap-4">
                    <span className="text-text-strong text-body-medium-medium">Plans</span>
                    <div className="w-full overflow-x-auto">
                        <Plans />
                    </div>
                </div>
                {canManageBilling && (
                    <>
                        <Separator />
                        <div id="payment-and-invoices">
                            <Payment />
                        </div>
                    </>
                )}
            </div>
        </DashboardLayout>
    );
};
