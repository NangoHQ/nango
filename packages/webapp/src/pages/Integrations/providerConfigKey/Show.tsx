import { ExternalLink, Plus } from 'lucide-react';
import { Helmet } from 'react-helmet';
import { Link, useParams } from 'react-router-dom';

import { CriticalErrorAlert } from '@/components/patterns/CriticalErrorAlert';
import { IntegrationLogo } from '@/components/patterns/IntegrationLogo';
import { PermissionGate } from '@/components/patterns/PermissionGate';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { useEnvironment } from '@/hooks/useEnvironment';
import { useGetIntegration } from '@/hooks/useIntegration';
import { usePathNavigation } from '@/hooks/usePathNavigation';
import { usePermissions } from '@/hooks/usePermissions';
import DashboardLayout from '@/layout/DashboardLayout';
import { useStore } from '@/store';
import { openPlaygroundWithContext } from '@/utils/playground';
import { AutoIdlingBanner } from '../components/AutoIdlingBanner';
import { FunctionsTab } from './Functions/Tab';
import { SettingsTab } from './Settings/Tab';

const integrationTabClassName = 'gap-1 px-2 py-1.5 data-[state=active]:border-interactive-selected-fill';
const integrationLinkTabClassName = 'w-fit inline-flex items-center gap-1 px-2 py-1.5';

export const ShowIntegration: React.FC = () => {
    const { providerConfigKey } = useParams();
    const env = useStore((state) => state.env);
    const [activeTab, setActiveTab] = usePathNavigation(`/${env}/integrations/${providerConfigKey}`, 'functions');

    const { data: environmentData, isLoading: loadingEnvironment, error: environmentError } = useEnvironment(env);
    const environmentAndAccount = environmentData?.environmentAndAccount;

    const { can } = usePermissions();
    const canCreateTestConnection = can('environment:connections:update');

    const { data, isLoading: loadingIntegration, error: integrationError } = useGetIntegration(env, providerConfigKey!);
    const integration = data?.data;

    if (integrationError || environmentError) {
        return <CriticalErrorAlert message="Something went wrong while loading the integration" />;
    }

    const isLoading = loadingIntegration || loadingEnvironment || !integration || !environmentAndAccount;

    if (isLoading) {
        return (
            <DashboardLayout
                fullWidth
                className="flex flex-col gap-4"
                title=" "
                titleLeading={<Skeleton className="size-6" />}
                titleActions={<Skeleton className="h-8 w-44" />}
            >
                <Helmet>
                    <title>Integration - Nango</title>
                </Helmet>
                <Skeleton className="w-full h-10" />
                <Skeleton className="w-56 h-8" />
            </DashboardLayout>
        );
    }

    const displayName = integration.integration.display_name || integration.template.display_name;

    return (
        <DashboardLayout
            fullWidth
            className="flex flex-col gap-4"
            title={displayName}
            titleLeading={<IntegrationLogo provider={integration.integration.provider} className="size-6 rounded-[10px] p-0.5" />}
            titleActions={
                <PermissionGate condition={canCreateTestConnection} asChild>
                    {(allowed) => (
                        <ButtonLink to={`/${env}/connections/create?integration_id=${integration.integration.unique_key}`} size="md" disabled={!allowed}>
                            <Plus />
                            Add test connection
                        </ButtonLink>
                    )}
                </PermissionGate>
            }
        >
            <Helmet>
                <title>Integration - Nango</title>
            </Helmet>

            <AutoIdlingBanner />

            <Tabs
                value={activeTab}
                onValueChange={(value) => {
                    if (value === 'playground') {
                        openPlaygroundWithContext({ source: 'integration', integration: integration.integration.unique_key });
                    } else {
                        setActiveTab(value);
                    }
                }}
                className="gap-4"
            >
                <TabsList className="gap-3">
                    <TabsTrigger value="functions" className={integrationTabClassName}>
                        Functions
                    </TabsTrigger>
                    <TabsTrigger value="settings" className={integrationTabClassName}>
                        Settings
                    </TabsTrigger>
                    <TabsTrigger value="setup-guide" disabled asChild>
                        <Link to={integration.template.docs} target="_blank" className={integrationLinkTabClassName}>
                            API setup guide <ExternalLink className="size-3.5" />
                        </Link>
                    </TabsTrigger>
                    <TabsTrigger value="logs" disabled asChild>
                        <Link to={`/${env}/logs?integrations=${integration.integration.unique_key}`} className={integrationLinkTabClassName}>
                            Logs <ExternalLink className="size-3.5" />
                        </Link>
                    </TabsTrigger>
                    <TabsTrigger value="connections" disabled asChild>
                        <Link to={`/${env}/connections?integrations=${integration.integration.unique_key}`} className={integrationLinkTabClassName}>
                            Connections <ExternalLink className="size-3.5" />
                        </Link>
                    </TabsTrigger>
                    <TabsTrigger value="playground" className={integrationTabClassName}>
                        Playground <ExternalLink className="size-3.5" />
                    </TabsTrigger>
                </TabsList>
                <TabsContent value="functions">
                    <FunctionsTab integration={integration.integration} />
                </TabsContent>
                <TabsContent value="settings">
                    <SettingsTab data={integration} environment={environmentAndAccount.environment} />
                </TabsContent>
            </Tabs>
        </DashboardLayout>
    );
};
