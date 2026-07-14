import { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useLocation } from 'react-router-dom';

import { permissions } from '@nangohq/authz';

import { PermissionGate } from '@/components/patterns/PermissionGate';
import { Navigation, NavigationContent, NavigationList, NavigationTrigger } from '@/components/ui/Navigation';
import { useHashNavigation } from '@/hooks/useHashNavigation';
import { useMeta } from '@/hooks/useMeta';
import { usePermissions } from '@/hooks/usePermissions';
import { track } from '@/utils/analytics';
import DashboardLayout from '../../../layout/DashboardLayout';
import { MonthSelector } from './components/MonthSelector';
import { Payment } from './components/Payment';
import { Plans } from './components/Plans';
import { Usage } from './components/Usage';
import { useBreakdownEnabled } from './useBreakdownEnabled';

export const TeamBilling: React.FC = () => {
    const [activeTab, setActiveTab] = useHashNavigation('usage');
    const isUsageTab = activeTab === 'usage';
    const [selectedMonth, setSelectedMonth] = useState<Date>(() => {
        const now = new Date();
        return new Date(now.getUTCFullYear(), now.getUTCMonth(), 1);
    });

    const { can } = usePermissions();
    const canManageBilling = can(permissions.canManageBilling);

    const breakdownEnabled = useBreakdownEnabled();
    const { isLoading: metaLoading } = useMeta();

    useEffect(() => {
        if (!canManageBilling && activeTab === 'payment-and-invoices') {
            setActiveTab('usage');
        }
    }, [canManageBilling, activeTab, setActiveTab]);

    // The tab the URL actually points at. useHashNavigation starts at the default ('usage') and only
    // syncs from the hash after mount, so opening #plans/#payment-and-invoices would briefly leave
    // activeTab === 'usage' for one render. Read the hash directly so the view event isn't fired for
    // those tabs. Empty hash means the default Usage tab.
    const location = useLocation();
    const onUsageTab = (location.hash ? location.hash.slice(1) : 'usage') === 'usage';

    // Fire one usage-page view per activation, but only once meta has resolved: breakdown_enabled comes
    // from /api/v1/meta (via useBreakdownEnabled) and reads false while it loads, which would mis-tag
    // the view for ClickHouse-rollout accounts. The ref resets on leaving the tab so returning re-tracks.
    const viewTrackedRef = useRef(false);
    useEffect(() => {
        if (!onUsageTab) {
            viewTrackedRef.current = false;
            return;
        }
        if (metaLoading || viewTrackedRef.current) {
            return;
        }
        viewTrackedRef.current = true;
        track('web:usage:viewed', { breakdown_enabled: breakdownEnabled });
    }, [onUsageTab, metaLoading, breakdownEnabled]);

    // Full-width page shell keeps chrome consistent with the other dashboard pages, but the billing
    // content is capped and left-aligned: the usage charts have a fixed height, so unbounded width
    // stretches them to an unreadable aspect ratio on wide screens.
    return (
        <DashboardLayout fullWidth title="Billing & usage">
            <Helmet>
                <title>Billing & usage - Nango</title>
            </Helmet>
            <div className="flex flex-col gap-8 max-w-[1280px]">
                <header className="flex justify-end items-center">
                    {isUsageTab && (
                        <div className="flex items-center gap-4">
                            <MonthSelector onMonthChange={setSelectedMonth} />
                        </div>
                    )}
                </header>
                <Navigation value={activeTab} onValueChange={setActiveTab} className="max-w-full">
                    <NavigationList>
                        <NavigationTrigger value={'usage'}>Usage</NavigationTrigger>
                        <NavigationTrigger value={'plans'}>Plans</NavigationTrigger>
                        <PermissionGate condition={canManageBilling}>
                            {(allowed) => (
                                <NavigationTrigger value={'payment-and-invoices'} disabled={!allowed}>
                                    Payment & Invoices
                                </NavigationTrigger>
                            )}
                        </PermissionGate>
                    </NavigationList>
                    <NavigationContent value={'usage'} className="w-full flex flex-col gap-6">
                        <Usage selectedMonth={selectedMonth} />
                    </NavigationContent>
                    <NavigationContent value={'plans'} className="w-full overflow-x-auto">
                        <Plans />
                    </NavigationContent>
                    {canManageBilling && (
                        <NavigationContent value={'payment-and-invoices'} className="w-full">
                            <Payment />
                        </NavigationContent>
                    )}
                </Navigation>
            </div>
        </DashboardLayout>
    );
};
