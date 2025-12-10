import { ExternalLink, Loader2 } from 'lucide-react';
import { Helmet } from 'react-helmet';
import { Link, useParams } from 'react-router-dom';

import { AutoIdlingBanner } from '../components/AutoIdlingBanner';
import { FunctionsTab } from './Functions/Tab';
import { ErrorPageComponent } from '@/components/ErrorComponent';
import { IntegrationLogo } from '@/components-v2/IntegrationLogo';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components-v2/Tabs';
import { Button } from '@/components-v2/ui/button';
import { useGetIntegration } from '@/hooks/useIntegration';
import DashboardLayout from '@/layout/DashboardLayout';
import { useStore } from '@/store';

export const ShowIntegration: React.FC = () => {
    const { providerConfigKey } = useParams();
    const env = useStore((state) => state.env);
    const { data, loading: loadingIntegration, error } = useGetIntegration(env, providerConfigKey!);

    if (error) {
        return <ErrorPageComponent title="Integration" error={error} />;
    }

    if (loadingIntegration || !data) {
        return (
            <DashboardLayout fullWidth className="flex items-center justify-center">
                <Helmet>
                    <title>Integration - Nango</title>
                </Helmet>

                <Loader2 className="w-10 h-10 animate-spin" />
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
                    <Button size="lg">Add test connection</Button>
                </div>
                <Tabs basePath={`/${env}/integrations/${providerConfigKey}`} defaultValue="functions">
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
                        <FunctionsTab integration={data.integration} provider={data.template} />
                    </TabsContent>
                    <TabsContent value="settings">Settings</TabsContent>
                </Tabs>
            </div>
        </DashboardLayout>
    );
};
