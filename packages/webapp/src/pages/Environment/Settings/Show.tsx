import { Helmet } from 'react-helmet';
import { LeftNavBarItems } from '../../../components/LeftNavBar';
import DashboardLayout from '../../../layout/DashboardLayout';
import { AuthorizationSettings } from './Authorization';
import { VariablesSettings } from './Variables';
import { NotificationSettings } from './Notification';
import { BackendSettings } from './Backend';
import { ExportSettings } from './Export';

export const EnvironmentSettings: React.FC = () => {
    return (
        <DashboardLayout selectedItem={LeftNavBarItems.EnvironmentSettings} className="p-6">
            <Helmet>
                <title>Environment Settings - Nango</title>
            </Helmet>

            <div className="flex justify-between mb-8 items-center">
                <h2 className="flex text-left text-3xl font-semibold tracking-tight text-white">Environment Settings</h2>
            </div>
            <div className="flex flex-col gap-20 h-fit">
                <BackendSettings />
                <NotificationSettings />
                <VariablesSettings />
                <ExportSettings />
                <AuthorizationSettings />
            </div>
        </DashboardLayout>
    );
};
