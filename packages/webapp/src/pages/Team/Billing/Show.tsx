import { Helmet } from 'react-helmet';

import { Payment } from './components/Payment';
import { Plans } from './components/Plans';
import { Usage } from './components/Usage';
import DashboardLayout from '../../../layout/DashboardLayout';
import { Navigation, NavigationContent, NavigationList, NavigationTrigger } from '@/components-v2/Navigation';

export const TeamBilling: React.FC = () => {
    return (
        <DashboardLayout className="flex flex-col gap-8">
            <Helmet>
                <title>Billing - Nango</title>
            </Helmet>
            <h2 className="text-text-primary text-2xl font-bold">Billing & Usage</h2>
            <Navigation defaultValue="usage" className="max-w-full">
                <NavigationList>
                    <NavigationTrigger value={'usage'}>Usage</NavigationTrigger>
                    <NavigationTrigger value={'plans'}>Plans</NavigationTrigger>
                    <NavigationTrigger value={'payment-and-invoices'}>Payment & Invoices</NavigationTrigger>
                </NavigationList>
                <NavigationContent value={'usage'} className="w-full flex flex-col gap-6">
                    <Usage />
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
