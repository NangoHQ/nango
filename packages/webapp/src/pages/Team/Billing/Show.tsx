import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useLocation } from 'react-router-dom';

import { permissions } from '@nangohq/authz';

import { PermissionGate } from '@/components/patterns/PermissionGate';
import { Navigation, NavigationContent, NavigationList, NavigationTrigger } from '@/components/ui/Navigation';
import { useEnvironment } from '@/hooks/useEnvironment';
import { useHashNavigation } from '@/hooks/useHashNavigation';
import { usePermissions } from '@/hooks/usePermissions';
import { useStore } from '@/store';
import { track } from '@/utils/analytics';
import DashboardLayout from '../../../layout/DashboardLayout';
import { MonthSelector } from './components/MonthSelector';
import { Payment } from './components/Payment';
import { Plans } from './components/Plans';
import { Usage } from './components/Usage';

export const TeamBilling: React.FC = () => {
    const [activeTab, setActiveTab] = useHashNavigation('usage');
    const isUsageTab = activeTab === 'usage';
    const [selectedMonth, setSelectedMonth] = useState<Date>(() => {
        const now = new Date();
        return new Date(now.getUTCFullYear(), now.getUTCMonth(), 1);
    });

    const env = useStore((state) => state.env);
    const { data: environmentData } = useEnvironment(env);
    // Free renders its own month selector in the caps table header, so the shared page-header
    // selector is hidden to avoid two competing pickers.
    const isFreePlan = environmentData?.plan?.name === 'free';

    const { can } = usePermissions();
    const canManageBilling = can(permissions.canManageBilling);

    useEffect(() => {
        if (!canManageBilling && activeTab === 'payment-and-invoices') {
            setActiveTab('usage');
        }
    }, [canManageBilling, activeTab, setActiveTab]);

    // Read the tab from the URL hash directly: useHashNavigation defaults to 'usage' until it syncs
    // after mount, so opening #plans would otherwise fire a usage view for one render.
    const location = useLocation();
    const onUsageTab = (location.hash ? location.hash.slice(1) : 'usage') === 'usage';

    // Track a usage-page view when the tab becomes active (initial load or switching back to it).
    useEffect(() => {
        if (onUsageTab) {
            track('web:usage:viewed', {});
        }
    }, [onUsageTab]);

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
                    {isUsageTab && !isFreePlan && (
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
