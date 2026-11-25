import { ArrowUpRight, Ellipsis, Zap } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate, useParams } from 'react-router-dom';

import { Alert, AlertDescription, Badge, Button, IconButton, SplitButton, SplitButtonAction, SplitButtonMenuTrigger } from '@nangohq/design-system';

import { ErrorPageComponent } from '@/components/patterns/ErrorComponent';
import { PermissionGate } from '@/components/patterns/PermissionGate';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/DropdownMenu';
import { Skeleton } from '@/components/ui/Skeleton';
import { useListIntegrations, usePostIntegration } from '@/hooks/useIntegration';
import { useGetProviderTemplates } from '@/hooks/useIntegrationFunctions';
import { usePermissions } from '@/hooks/usePermissions';
import { useProviders } from '@/hooks/useProviders';
import { useToast } from '@/hooks/useToast';
import DashboardLayout from '@/layout/DashboardLayout';
import { TryInPlaygroundButton } from '@/pages/AgentPlayground/components/TryInPlaygroundButton';
import { useStore } from '@/store';
import { getDisplayName } from '../Integrations/utils';
import PageNotFound from '../PageNotFound';
import { trackSetupButtonClick } from './analytics';
import { getCategoryLabel, getOneClickSetupBody, getVisibleCategories, hasCustomSetup, isMcp } from './catalog.utils';
import { CatalogFunctions } from './components/CatalogFunctions';
import { CatalogLogo } from './components/CatalogLogo';
import { ProviderCallout } from './components/ProviderCallout';

import type { SetupButtonSource } from './analytics';
import type { ProviderCalloutState } from './components/ProviderCallout';
import type { ApiProviderListItem } from '@nangohq/types';

export const CatalogProviderShow: React.FC = () => {
    const env = useStore((state) => state.env);
    const { provider: providerName = '' } = useParams();
    const { data: providersData, isPending, error } = useProviders(env);
    const { data: integrationsData, isPending: integrationsPending } = useListIntegrations(env);
    const { can } = usePermissions();
    const canSetUp = can('environment:integrations:update');
    const canCreateConnection = can('environment:connections:update');
    const { data: templatesData, isPending: templatesPending, error: templatesError } = useGetProviderTemplates({ env, provider: providerName });
    const { mutateAsync: postIntegration } = usePostIntegration(env);
    const navigate = useNavigate();
    const { toast } = useToast();
    const [settingUp, setSettingUp] = useState(false);

    const provider = providersData?.data.find((item) => item.name === providerName);
    const configuredIntegrationIds = useMemo(
        () =>
            integrationsPending
                ? null
                : (integrationsData?.data ?? []).filter((integration) => integration.provider === providerName).map((integration) => integration.unique_key),
        [integrationsPending, integrationsData, providerName]
    );

    if (error && !providersData) {
        return <ErrorPageComponent title="Catalog" error={error} />;
    }
    if (isPending) {
        return (
            <DashboardLayout>
                <Skeleton className="h-24 w-full" />
            </DashboardLayout>
        );
    }
    if (!provider) {
        return <PageNotFound />;
    }

    const calloutState = getCalloutState(provider, configuredIntegrationIds);
    const oneClickSetupBody = getOneClickSetupBody(provider);
    const existingIntegrationId = configuredIntegrationIds?.[0];
    const addIntegration = async (source: SetupButtonSource) => {
        if (!oneClickSetupBody) {
            return;
        }
        trackSetupButtonClick(provider.name, source, 'one_click');
        setSettingUp(true);
        try {
            const response = await postIntegration(oneClickSetupBody);
            toast({ title: `${provider.displayName} integration added`, variant: 'success' });
            await navigate(`/${env}/integrations/${encodeURIComponent(response.data.unique_key)}/functions`);
        } catch {
            toast({ title: `Failed to add ${provider.displayName}`, variant: 'error' });
        } finally {
            setSettingUp(false);
        }
    };
    const renderSetupButton = (source: SetupButtonSource, size: 'sm' | 'md') => (
        <PermissionGate asChild condition={existingIntegrationId ? canCreateConnection : canSetUp}>
            {(allowed) => {
                if (configuredIntegrationIds === null) {
                    return (
                        <Button variant="primary" size={size} loading disabled>
                            Add integration
                        </Button>
                    );
                }
                if (existingIntegrationId) {
                    return (
                        <ButtonLink
                            to={`/${env}/connections/create?integration_id=${encodeURIComponent(existingIntegrationId)}`}
                            variant="primary"
                            size={size}
                            disabled={!allowed}
                        >
                            Add test connection
                        </ButtonLink>
                    );
                }
                if (oneClickSetupBody && hasCustomSetup(provider)) {
                    return (
                        <SplitButton variant="primary" size={size} disabled={!allowed}>
                            <SplitButtonAction loading={settingUp} onClick={() => void addIntegration(source)}>
                                <Zap className="fill-current stroke-none" />
                                Add integration
                            </SplitButtonAction>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <SplitButtonMenuTrigger label="More ways to add" />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                        onSelect={() => {
                                            trackSetupButtonClick(provider.name, source, 'advanced');
                                            void navigate(`/${env}/catalog/${provider.name}/add`);
                                        }}
                                    >
                                        Advanced…
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </SplitButton>
                    );
                }
                return oneClickSetupBody ? (
                    <Button variant="primary" size={size} disabled={!allowed} loading={settingUp} onClick={() => void addIntegration(source)}>
                        <Zap className="fill-current stroke-none" />
                        Add integration
                    </Button>
                ) : (
                    <ButtonLink
                        to={`/${env}/catalog/${provider.name}/add`}
                        variant="primary"
                        size={size}
                        disabled={!allowed}
                        onClick={() => trackSetupButtonClick(provider.name, source, 'form')}
                    >
                        Add integration
                    </ButtonLink>
                );
            }}
        </PermissionGate>
    );
    const { instantSetup } = provider;
    const categories = getVisibleCategories(provider);

    const showMoreMenu = Boolean(existingIntegrationId && canSetUp);

    return (
        <DashboardLayout hasPageHeading breadcrumbLabel={provider.displayName} className="flex flex-col gap-6">
            <Helmet>
                <title>{provider.displayName} - Catalog - Nango</title>
            </Helmet>

            <header className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                    <CatalogLogo provider={provider.name} displayName={provider.displayName} size="lg" />
                    <div className="flex min-w-0 flex-col gap-1.5">
                        <h1 className="truncate type-heading-sm text-text-strong">{provider.displayName}</h1>
                        <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant="secondary">{getDisplayName(provider.authMode)}</Badge>
                            {instantSetup && <Badge variant="secondary">Instant setup</Badge>}
                            {categories.length > 0 && <span className="mx-0.5 h-3 border-l border-border-strong" aria-hidden />}
                            {categories.map((category) => (
                                <Badge key={category} variant="secondary">
                                    {getCategoryLabel(category)}
                                </Badge>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    <Button asChild variant="ghost" size="md">
                        <a href={provider.docs} target="_blank" rel="noreferrer">
                            Docs <ArrowUpRight />
                        </a>
                    </Button>
                    {existingIntegrationId && (
                        <TryInPlaygroundButton provider={provider.name} integrationName={provider.displayName} source="catalog" variant="outline" />
                    )}
                    {renderSetupButton('header', 'md')}
                    {showMoreMenu && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <IconButton variant="ghost" size="md" label="More actions">
                                    <Ellipsis />
                                </IconButton>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                    onSelect={() => {
                                        trackSetupButtonClick(provider.name, 'more_menu', 'form');
                                        void navigate(`/${env}/catalog/${provider.name}/add`);
                                    }}
                                >
                                    Add another integration
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>
            </header>

            <ProviderCallout state={calloutState} displayName={provider.displayName} provider={provider.name} env={env} />

            {templatesPending ? (
                <Skeleton className="h-24 w-full" />
            ) : templatesError ? (
                <Alert variant="danger">
                    <AlertDescription>Couldn&apos;t load {provider.displayName}&apos;s tools and syncs. Refresh the page to try again.</AlertDescription>
                </Alert>
            ) : (
                <CatalogFunctions
                    templates={templatesData?.data ?? []}
                    provider={provider.name}
                    displayName={provider.displayName}
                    isMcp={isMcp(provider)}
                    renderSetupButton={() => (existingIntegrationId ? null : renderSetupButton('panel', 'sm'))}
                />
            )}
        </DashboardLayout>
    );
};

function getCalloutState(provider: ApiProviderListItem, configuredIntegrationIds: string[] | null): ProviderCalloutState {
    const { instantSetup } = provider;
    if (configuredIntegrationIds === null) {
        // Only instant setup apps always end up with a callout. Elsewhere a placeholder could vanish once the list loads.
        return instantSetup ? { kind: 'loading' } : { kind: 'none' };
    }
    if (configuredIntegrationIds.length > 0) {
        return { kind: 'configured', integrationIds: configuredIntegrationIds };
    }
    if (instantSetup === 'nango-managed-app') {
        return { kind: 'instant-managed' };
    }
    if (instantSetup === 'no-dev-app') {
        if (provider.authMode === 'MCP_OAUTH2') {
            return { kind: 'instant-mcp' };
        }
        return provider.authMode === 'API_KEY' ? { kind: 'instant-api-key' } : { kind: 'instant-other' };
    }
    return { kind: 'none' };
}
