import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';

import { AuthorizationSettings } from './Authorization';
import { BackendSettings } from './Backend';
import { DeleteAlert } from './DeleteAlert';
import { ExportSettings } from './Export';
import { MainSettings } from './Main';
import { NotificationSettings } from './Notification';
import { VariablesSettings } from './Variables';
import { LeftNavBarItems } from '../../../components/LeftNavBar';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../../../components/ui/Accordion';
import { Skeleton } from '../../../components/ui/Skeleton';
import { PROD_ENVIRONMENT_NAME } from '../../../constants';
import { apiDeleteEnvironment, useEnvironment } from '../../../hooks/useEnvironment';
import { useMeta } from '../../../hooks/useMeta';
import { useToast } from '../../../hooks/useToast';
import DashboardLayout from '../../../layout/DashboardLayout';
import { useStore } from '../../../store';

export const EnvironmentSettings: React.FC = () => {
    const { toast } = useToast();

    const { mutate: mutateMeta } = useMeta();
    const env = useStore((state) => state.env);
    const setEnv = useStore((state) => state.setEnv);

    const { environmentAndAccount } = useEnvironment(env);
    const [scrolled, setScrolled] = useState(false);
    const [showDeleteAlert, setShowDeleteAlert] = useState(false);

    useEffect(() => {
        if (!environmentAndAccount || scrolled) {
            return;
        }

        setScrolled(true);
        const hash = window.location.hash.slice(1); // Remove the '#' character from the hash
        if (!hash) {
            return;
        }

        const element = document.getElementById(hash);
        if (!element) {
            return;
        }

        element.scrollIntoView({ behavior: 'smooth' });
    }, [environmentAndAccount]);

    const handleDelete = async () => {
        const { res } = await apiDeleteEnvironment(env);
        if (res.status >= 200 && res.status < 300) {
            setShowDeleteAlert(false);
            // We have to start by changing the url, otherwise PrivateRoute will the env revert it based on it.
            window.history.replaceState({}, '', `/${PROD_ENVIRONMENT_NAME}/environment-settings`);
            await mutateMeta();
            setEnv(PROD_ENVIRONMENT_NAME);
            toast({
                title: 'The environment has been deleted successfully',
                variant: 'success'
            });
        } else {
            toast({
                title: 'Failed to delete environment',
                variant: 'error'
            });
        }
    };

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
                {env !== PROD_ENVIRONMENT_NAME && (
                    <DeleteAlert environmentName={env} onDelete={handleDelete} open={showDeleteAlert} onOpenChange={setShowDeleteAlert} />
                )}
            </div>

            <div className="flex flex-col gap-20 h-fit" key={env}>
                <MainSettings />
                <BackendSettings />
                <NotificationSettings />
                <VariablesSettings />
                <ExportSettings />
                <Accordion type="single" collapsible>
                    <AccordionItem value="item-1" id="authorization">
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
