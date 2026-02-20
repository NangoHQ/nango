import { ExternalLink } from 'lucide-react';
import { Helmet } from 'react-helmet';
import { Link, useParams } from 'react-router-dom';

import { AutoIdlingBanner } from '../components/AutoIdlingBanner';
import { FunctionsTab } from './Functions/Tab';
import { SettingsTab } from './Settings/Tab';
import { IntegrationSideInfo } from './components/IntegrationSideInfo';
import { CriticalErrorAlert } from '@/components-v2/CriticalErrorAlert';
import { IntegrationLogo } from '@/components-v2/IntegrationLogo';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components-v2/Tabs';
import { ButtonLink } from '@/components-v2/ui/button';
import { Skeleton } from '@/components-v2/ui/skeleton';
import { useEnvironment } from '@/hooks/useEnvironment';
import { useGetIntegration } from '@/hooks/useIntegration';
import { usePathNavigation } from '@/hooks/usePathNavigation';
import DashboardLayout from '@/layout/DashboardLayout';
import { useStore } from '@/store';

export const ShowIntegration: React.FC = () => {
    const { providerConfigKey } = useParams();
    const env = useStore((state) => state.env);
    const [activeTab, setActiveTab] = usePathNavigation(`/${env}/integrations/${providerConfigKey}`, 'functions');

    const { environmentAndAccount, loading: loadingEnvironment, error: environmentError } = useEnvironment(env);
    const { data, isPending: loadingIntegration, error: integrationError } = useGetIntegration(env, providerConfigKey!);
    const integration = data?.data;

    if (integrationError || environmentError) {
        return <CriticalErrorAlert message="Something went wrong while loading the integration" />;
    }

    const isLoading = loadingIntegration || loadingEnvironment || !integration || !environmentAndAccount;

    if (isLoading) {
        return (
            <DashboardLayout className="flex flex-col gap-8">
                <Helmet>
                    <title>Integration - Nango</title>
                </Helmet>

                <div className="flex flex-col gap-5 w-full">
                    <div className="inline-flex justify-between">
                        <div className="inline-flex items-center gap-2">
                            <Skeleton className="size-15" />
                            <Skeleton className="w-36 h-6" />
                        </div>
                        <Skeleton className="w-36 h-10" />
                    </div>
                    <Skeleton className="w-full h-10" />
                    <Skeleton className="w-56 h-10" />
                </div>
            </DashboardLayout>
        );
    }
    return (
        <DashboardLayout className="flex flex-col gap-8">
            <Helmet>
                <title>Integration - Nango</title>
            </Helmet>

            <AutoIdlingBanner />

            <div className="flex flex-col gap-5 w-full">
                <div className="inline-flex justify-between">
                    <div className="inline-flex items-center gap-2">
                        <IntegrationLogo provider={integration.integration.provider} className="size-15" />
                        <span className="text-text-primary text-body-large-semi">
                            {integration.integration.display_name ?? integration.template.display_name}
                        </span>
                    </div>
                    <ButtonLink to={`/${env}/connections/create?integration_id=${integration.integration.unique_key}`} size="lg">
                        Add test connection
                    </ButtonLink>
                </div>
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList>
                        <TabsTrigger value="functions">Functions</TabsTrigger>
                        <TabsTrigger value="settings">Settings</TabsTrigger>
                        <TabsTrigger value="setup-guide" disabled asChild>
                            <Link to={integration.template.docs} target="_blank" className="w-fit inline-flex items-center gap-1.5">
                                API setup guide <ExternalLink className="size-4" />
                            </Link>
                        </TabsTrigger>
                        <TabsTrigger value="logs" disabled asChild>
                            <Link
                                to={`/${env}/logs?integrations=${integration.integration.unique_key}`}
                                target="_blank"
                                className="w-fit inline-flex items-center gap-1.5"
                            >
                                Logs <ExternalLink className="size-4" />
                            </Link>
                        </TabsTrigger>
                    </TabsList>
                    <TabsContent value="functions">
                        <div className="flex w-full gap-11 justify-between">
                            <FunctionsTab integration={integration.integration} />
                            <IntegrationSideInfo integration={integration.integration} provider={integration.template} />
                        </div>
                    </TabsContent>
                    <TabsContent value="settings">
                        <div className="flex w-full gap-11 justify-between">
                            <SettingsTab data={integration} environment={environmentAndAccount?.environment} />
                            <IntegrationSideInfo integration={integration.integration} provider={integration.template} />
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
        </DashboardLayout>
    );
};
