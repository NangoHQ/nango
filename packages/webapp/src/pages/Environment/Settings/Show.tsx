import { Helmet } from 'react-helmet';
import { LeftNavBarItems } from '../../../components/LeftNavBar';
import DashboardLayout from '../../../layout/DashboardLayout';
import { AuthorizationSettings } from './Authorization';
import { VariablesSettings } from './Variables';
import { NotificationSettings } from './Notification';
import { BackendSettings } from './Backend';
import { ExportSettings } from './Export';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../../../components/ui/Accordion';
import { useEnvironment } from '../../../hooks/useEnvironment';
import { useStore } from '../../../store';
import { Skeleton } from '../../../components/ui/Skeleton';

export const EnvironmentSettings: React.FC = () => {
    const env = useStore((state) => state.env);
    const { environmentAndAccount } = useEnvironment(env);
    if (!environmentAndAccount) {
        return (
            <DashboardLayout selectedItem={LeftNavBarItems.EnvironmentSettings} className="p-6">
                <Helmet>
                    <title>Environment Settings - Nango</title>
                </Helmet>
                <div className="flex justify-between mb-8 items-center">
                    <h2 className="flex text-left text-3xl font-semibold tracking-tight text-white">Environment Settings</h2>
                </div>
                <div className="flex gap-2 flex-col">
                    <Skeleton style={{ width: '50%' }} />
                    <Skeleton style={{ width: '50%' }} />
                    <Skeleton style={{ width: '50%' }} />
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.EnvironmentSettings} className="p-6">
            <Helmet>
                <title>Environment Settings - Nango</title>
            </Helmet>

            <div className="flex justify-between mb-8 items-center">
                <h2 className="flex text-left text-3xl font-semibold tracking-tight text-white">Environment Settings</h2>
            </div>
            <div className="flex flex-col gap-20 h-fit" key={env}>
                <BackendSettings />
                <NotificationSettings />
                <VariablesSettings />
                <ExportSettings />
                <Accordion type="single" collapsible>
                    <AccordionItem value="item-1">
                        <AccordionTrigger>Deprecated authorization settings</AccordionTrigger>
                        <AccordionContent>
                            <AuthorizationSettings />
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            </div>
        </DashboardLayout>
    );
};
