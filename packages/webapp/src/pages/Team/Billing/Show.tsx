import { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useLocation } from 'react-router-dom';

import { MonthSelector } from './components/MonthSelector';
import { Payment } from './components/Payment';
import { Plans } from './components/Plans';
import { Usage } from './components/Usage';
import DashboardLayout from '../../../layout/DashboardLayout';
import { Navigation, NavigationContent, NavigationList, NavigationTrigger } from '@/components-v2/Navigation';

export const TeamBilling: React.FC = () => {
    const location = useLocation();
    // Navigation defaults to 'usage' when no hash is present
    const isUsageTab = !location.hash || location.hash === '#usage';
    const [selectedMonth, setSelectedMonth] = useState<Date>(() => {
        const now = new Date();
        return new Date(now.getUTCFullYear(), now.getUTCMonth(), 1);
    });

    return (
        <DashboardLayout className="flex flex-col gap-8">
            <Helmet>
                <title>Billing & usage - Nango</title>
            </Helmet>
            <header className="flex justify-between items-center">
                <h2 className="text-text-primary text-2xl font-semibold">Billing & usage</h2>
                {isUsageTab && (
                    <div>
                        <MonthSelector onMonthChange={setSelectedMonth} />
                    </div>
                )}
            </header>
            <Navigation defaultValue="usage" className="max-w-full">
                <NavigationList>
                    <NavigationTrigger value={'usage'}>Usage</NavigationTrigger>
                    <NavigationTrigger value={'plans'}>Plans</NavigationTrigger>
                    <NavigationTrigger value={'payment-and-invoices'}>Payment & Invoices</NavigationTrigger>
                </NavigationList>
                <NavigationContent value={'usage'} className="w-full flex flex-col gap-6">
                    <Usage selectedMonth={selectedMonth} />
                </NavigationContent>
                <NavigationContent value={'plans'} className="w-full overflow-x-auto">
                    <Plans />
                </NavigationContent>
                <NavigationContent value={'payment-and-invoices'} className="w-full">
                    <Payment />
                </NavigationContent>
            </Navigation>
        </DashboardLayout>
    );
};
