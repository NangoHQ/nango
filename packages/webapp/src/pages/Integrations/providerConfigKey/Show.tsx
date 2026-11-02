import { ExternalLink, Play, Plus } from 'lucide-react';
import { Helmet } from 'react-helmet';
import { Link, useParams } from 'react-router-dom';

import { Button } from '@nangohq/design-system';

import { CriticalErrorAlert } from '@/components/patterns/CriticalErrorAlert';
import { IntegrationLogo } from '@/components/patterns/IntegrationLogo';
import { PermissionGate } from '@/components/patterns/PermissionGate';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Separator } from '@/components/ui/Separator';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { useEnvironment } from '@/hooks/useEnvironment';
import { useGetIntegration } from '@/hooks/useIntegration';
import { usePathNavigation } from '@/hooks/usePathNavigation';
import { usePermissions } from '@/hooks/usePermissions';
import DashboardLayout from '@/layout/DashboardLayout';
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
                        <Separator orientation="vertical" className="data-[orientation=vertical]:h-4" />
                        <Link to={integration.template.docs} target="_blank" rel="noopener noreferrer" className={integrationLinkClassName}>
                            Docs
                            <ExternalLink className="size-3.5" />
                        </Link>
                        {canRunFunctions && (
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
                    <FunctionsTab integration={integration.integration} />
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
