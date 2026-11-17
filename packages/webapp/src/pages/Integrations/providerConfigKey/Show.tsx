import { ArrowUpRight, Play } from 'lucide-react';
import { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useParams } from 'react-router-dom';

import { Button } from '@nangohq/design-system';

import { CriticalErrorAlert } from '@/components/patterns/CriticalErrorAlert';
import { TestConnectionButton } from '@/components/patterns/TestConnectionButton';
import { Separator } from '@/components/ui/Separator';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { useEnvironment } from '@/hooks/useEnvironment';
import { useGetIntegration } from '@/hooks/useIntegration';
import { usePathNavigation } from '@/hooks/usePathNavigation';
import { usePermissions } from '@/hooks/usePermissions';
import DashboardLayout from '@/layout/DashboardLayout';
import { TryInPlaygroundButton } from '@/pages/AgentPlayground/components/TryInPlaygroundButton';
import { CatalogLogo } from '@/pages/Catalog/components/CatalogLogo';
import { useStore } from '@/store';
import { openPlaygroundWithContext, useCanRunFunctions } from '@/utils/playground';
import { AutoIdlingBanner } from '../components/AutoIdlingBanner';
import { FunctionsTab } from './Functions/Tab';
import { SettingsTab } from './Settings/Tab';

const integrationTabClassName = 'gap-1 px-2 py-1.5 data-[state=active]:border-interactive-selected-fill';
const integrationLinkClassName =
    'inline-flex items-center gap-1 px-3 py-1.5 type-text-regular-sm text-text-default transition-colors hover:text-text-strong focus-default';

export const ShowIntegration: React.FC = () => {
    const { providerConfigKey } = useParams();
    const env = useStore((state) => state.env);
    const [activeTab, setActiveTab] = usePathNavigation(`/${env}/integrations/${providerConfigKey}`, 'functions');
    const [functionOpen, setFunctionOpen] = useState(false);
    const functionDrawerOpen = activeTab === 'functions' && functionOpen;

    const { data: environmentData, isLoading: loadingEnvironment, error: environmentError } = useEnvironment(env);
    const environmentAndAccount = environmentData?.environmentAndAccount;

    const { can } = usePermissions();
    const canCreateTestConnection = can('environment:connections:update');
    const canRunFunctions = useCanRunFunctions();

    const { data, isLoading: loadingIntegration, error: integrationError } = useGetIntegration(env, providerConfigKey!);
    const integration = data?.data;

    if (integrationError || environmentError) {
        return <CriticalErrorAlert message="Something went wrong while loading the integration" />;
    }

    const isLoading = loadingIntegration || loadingEnvironment || !integration || !environmentAndAccount;

    if (isLoading) {
        return (
            <DashboardLayout hasPageHeading className="flex flex-col gap-6">
                <Helmet>
                    <title>Integration - Nango</title>
                </Helmet>
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <Skeleton className="size-10" />
                        <Skeleton className="h-6 w-40" />
                    </div>
                    <Skeleton className="h-8 w-44" />
                </div>
                <Skeleton className="w-full h-10" />
                <Skeleton className="w-56 h-8" />
            </DashboardLayout>
        );
    }

    const displayName = integration.integration.display_name || integration.template.display_name;

    return (
        <DashboardLayout hasPageHeading className="flex flex-col gap-6">
            <Helmet>
                <title>Integration - Nango</title>
            </Helmet>

            <header className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                    <CatalogLogo provider={integration.integration.provider} displayName={displayName} size="lg" />
                    <h1 className="truncate type-heading-sm text-text-strong">{displayName}</h1>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    <Button asChild variant="ghost" size="md">
                        <a href={integration.template.docs} target="_blank" rel="noreferrer">
                            Docs <ArrowUpRight />
                        </a>
                    </Button>
                    <TryInPlaygroundButton provider={integration.integration.provider} integrationName={displayName} source="integration" variant="outline" />
                    <TestConnectionButton env={env} integrationIds={[integration.integration.unique_key]} canCreate={canCreateTestConnection} size="md" />
                </div>
            </header>

            <AutoIdlingBanner />

            <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-4">
                <div className="flex items-center justify-between gap-4">
                    <TabsList className="w-fit gap-3">
                        <TabsTrigger value="functions" className={integrationTabClassName}>
                            Functions
                        </TabsTrigger>
                        <TabsTrigger value="settings" className={integrationTabClassName}>
                            Settings
                        </TabsTrigger>
                    </TabsList>
                    <div className="flex items-center">
                        <Link to={`/${env}/logs?integrations=${integration.integration.unique_key}`} className={integrationLinkClassName}>
                            Logs
                        </Link>
                        <Separator orientation="vertical" className="data-[orientation=vertical]:h-4" />
                        <Link to={`/${env}/connections?integrations=${integration.integration.unique_key}`} className={integrationLinkClassName}>
                            Connections
                        </Link>
                        {canRunFunctions && !functionDrawerOpen && (
                            <div className="ml-3">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openPlaygroundWithContext({ source: 'integration', integration: integration.integration.unique_key })}
                                >
                                    <Play />
                                    Test run
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
                <TabsContent value="functions">
                    <FunctionsTab integration={integration.integration} onFunctionOpenChange={setFunctionOpen} />
                </TabsContent>
                <TabsContent value="settings">
                    <SettingsTab
                        key={`${environmentAndAccount.environment.name}:${integration.integration.unique_key}`}
                        data={integration}
                        environment={environmentAndAccount.environment}
                    />
                </TabsContent>
            </Tabs>
        </DashboardLayout>
    );
};
