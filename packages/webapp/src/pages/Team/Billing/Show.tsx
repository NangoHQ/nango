import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';

import { permissions } from '@nangohq/authz';

import { PermissionGate } from '@/components/patterns/PermissionGate';
import { Navigation, NavigationContent, NavigationList, NavigationTrigger } from '@/components/ui/Navigation';
import { useHashNavigation } from '@/hooks/useHashNavigation';
import { usePermissions } from '@/hooks/usePermissions';
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

    const { can } = usePermissions();
    const canManageBilling = can(permissions.canManageBilling);

    useEffect(() => {
        if (!canManageBilling && activeTab === 'payment-and-invoices') {
            setActiveTab('usage');
        }
    }, [canManageBilling, activeTab, setActiveTab]);

    return (
        <DashboardLayout fullWidth title="Billing & usage" className="flex flex-col gap-8">
            <Helmet>
                <title>Billing & usage - Nango</title>
            </Helmet>
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
        </DashboardLayout>
    );
};
