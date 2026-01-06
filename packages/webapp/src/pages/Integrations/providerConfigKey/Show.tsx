import { ExternalLink } from 'lucide-react';
import { Helmet } from 'react-helmet';
import { Link, useParams } from 'react-router-dom';

import { AutoIdlingBanner } from '../components/AutoIdlingBanner';
import { FunctionsTab } from './Functions/Tab';
import { SettingsTab } from './Settings/Tab';
import { IntegrationSideInfo } from './components/IntegrationSideInfo';
import { ErrorPageComponent } from '@/components/ErrorComponent';
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
    const { environmentAndAccount, loading: loadingEnvironment } = useEnvironment(env);
    const [activeTab, setActiveTab] = usePathNavigation(`/${env}/integrations/${providerConfigKey}`, 'functions');
    const { data, loading: loadingIntegration, error } = useGetIntegration(env, providerConfigKey!);

    if (error) {
        return <ErrorPageComponent title="Integration" error={error} />;
    }

    const isLoading = loadingIntegration || loadingEnvironment || !data || !environmentAndAccount;

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
                        <IntegrationLogo provider={data.integration.provider} className="size-15" />
                        <span className="text-text-primary text-body-large-semi">{data.integration.display_name ?? data.template.display_name}</span>
                    </div>
                    <ButtonLink to={`/${env}/connections/create?integration_id=${data.integration.unique_key}`} size="lg">
                        Add test connection
                    </ButtonLink>
                </div>
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList>
                        <TabsTrigger value="functions">Functions</TabsTrigger>
                        <TabsTrigger value="settings">Settings</TabsTrigger>
                        <TabsTrigger value="setup-guide" disabled asChild>
                            <Link to={data.template.docs} target="_blank" className="w-fit inline-flex items-center gap-1.5">
                                API setup guide <ExternalLink className="size-4" />
                            </Link>
                        </TabsTrigger>
                        <TabsTrigger value="logs" disabled asChild>
                            <Link
                                to={`/${env}/logs?integrations=${data.integration.unique_key}`}
                                target="_blank"
                                className="w-fit inline-flex items-center gap-1.5"
                            >
                                Logs <ExternalLink className="size-4" />
                            </Link>
                        </TabsTrigger>
                    </TabsList>
                    <TabsContent value="functions">
                        <div className="flex w-full gap-11 justify-between">
                            <FunctionsTab integration={data.integration} />
                            <IntegrationSideInfo integration={data.integration} provider={data.template} />
                        </div>
                    </TabsContent>
                    <TabsContent value="settings">
                        <div className="flex w-full gap-11 justify-between">
                            <SettingsTab data={data} environment={environmentAndAccount?.environment} />
                            <IntegrationSideInfo integration={data.integration} provider={data.template} />
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
        </DashboardLayout>
    );
};
