import { ArrowUpRight, Bot, Ellipsis } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { Alert, AlertDescription, Badge, Button, IconButton } from '@nangohq/design-system';

import { ErrorPageComponent } from '@/components/patterns/ErrorComponent';
import { PermissionGate } from '@/components/patterns/PermissionGate';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/DropdownMenu';
import { Skeleton } from '@/components/ui/Skeleton';
import { useCanUseAgentPlayground } from '@/hooks/useCanUseAgentPlayground';
import { useListIntegrations, usePostIntegration } from '@/hooks/useIntegration';
import { useGetProviderTemplates } from '@/hooks/useIntegrationFunctions';
import { usePermissions } from '@/hooks/usePermissions';
import { useProviders } from '@/hooks/useProviders';
import { useToast } from '@/hooks/useToast';
import DashboardLayout from '@/layout/DashboardLayout';
import { integrationPrompt, playgroundDraftState } from '@/pages/AgentPlayground/draft';
import { useStore } from '@/store';
import { getDisplayName } from '../Integrations/utils';
import PageNotFound from '../PageNotFound';
import { trackSetupButtonClick } from './analytics';
import { getCategoryLabel, getInstantSetup, getOneClickSetupBody, getVisibleCategories, hasCustomSetup, isMcp } from './catalog.utils';
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
    const { data: integrationsData, isSuccess: integrationsLoaded } = useListIntegrations(env);
    const { can } = usePermissions();
    const canSetUp = can('environment:integrations:update');
    const canUseAgentPlayground = useCanUseAgentPlayground();
    const { data: templatesData, isPending: templatesPending, error: templatesError } = useGetProviderTemplates({ env, provider: providerName });
    const { mutateAsync: postIntegration } = usePostIntegration(env);
    const navigate = useNavigate();
    const { toast } = useToast();
    const [settingUp, setSettingUp] = useState(false);

    const provider = providersData?.data.find((item) => item.name === providerName);
    const configuredIntegrationIds = useMemo(
        () =>
            integrationsLoaded
                ? (integrationsData?.data ?? []).filter((integration) => integration.provider === providerName).map((integration) => integration.unique_key)
                : null,
        [integrationsLoaded, integrationsData, providerName]
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
        trackSetupButtonClick(provider.name, source);
        setSettingUp(true);
        try {
            const response = await postIntegration(oneClickSetupBody);
            toast({ title: `${provider.displayName} integration added`, variant: 'success' });
            await navigate(`/${env}/integrations/${encodeURIComponent(response.data.unique_key)}`);
        } catch {
            toast({ title: `Failed to add ${provider.displayName}`, variant: 'error' });
        } finally {
            setSettingUp(false);
        }
    };
    const renderSetupButton = (source: SetupButtonSource, size: 'sm' | 'md') => (
        <PermissionGate asChild condition={canSetUp}>
            {(allowed) => {
                if (oneClickSetupBody && configuredIntegrationIds === null) {
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
                            onClick={() => trackSetupButtonClick(provider.name, source)}
                        >
                            Add test connection
                        </ButtonLink>
                    );
                }
                return oneClickSetupBody ? (
                    <Button variant="primary" size={size} disabled={!allowed} loading={settingUp} onClick={() => void addIntegration(source)}>
                        Add integration
                    </Button>
                ) : (
                    <ButtonLink
                        to={`/${env}/integrations/create/${provider.name}`}
                        variant="primary"
                        size={size}
                        disabled={!allowed}
                        onClick={() => trackSetupButtonClick(provider.name, source)}
                    >
                        Add integration
                    </ButtonLink>
                );
            }}
        </PermissionGate>
    );
    const renderSecondarySetupButton = () => {
        if (existingIntegrationId) {
            return (
                canUseAgentPlayground && (
                    <Button asChild variant="outline" size="md">
                        <Link
                            to={`/${env}/playground/agent`}
                            state={playgroundDraftState(integrationPrompt({ provider: provider.name, integrationName: provider.displayName }))}
                        >
                            <Bot />
                            Try in Playground
                        </Link>
                    </Button>
                )
            );
        }
        return renderCustomSetupButton();
    };
    const renderCustomSetupButton = () =>
        oneClickSetupBody &&
        hasCustomSetup(provider) && (
            <PermissionGate asChild condition={canSetUp}>
                {(allowed) => (
                    <ButtonLink
                        to={`/${env}/integrations/create/${provider.name}`}
                        variant="outline"
                        size="md"
                        disabled={!allowed}
                        onClick={() => trackSetupButtonClick(provider.name, 'header')}
                    >
                        Add with options
                    </ButtonLink>
                )}
            </PermissionGate>
        );
    const instantSetup = getInstantSetup(provider);
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
                    {renderSecondarySetupButton()}
                    {renderSetupButton('header', 'md')}
                    {showMoreMenu && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <IconButton variant="ghost" size="md" label="More actions">
                                    <Ellipsis />
                                </IconButton>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onSelect={() => void navigate(`/${env}/integrations/create/${provider.name}`)}>
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
                    displayName={provider.displayName}
                    isMcp={isMcp(provider)}
                    renderSetupButton={() => (existingIntegrationId ? null : renderSetupButton('panel', 'sm'))}
                />
            )}
        </DashboardLayout>
    );
};

function getCalloutState(provider: ApiProviderListItem, configuredIntegrationIds: string[] | null): ProviderCalloutState {
    const instantSetup = getInstantSetup(provider);
    if (configuredIntegrationIds === null) {
        // Only instant setup apps always end up with a callout. Elsewhere a placeholder could vanish once the list loads.
        return instantSetup ? { kind: 'loading' } : { kind: 'none' };
    }
    if (configuredIntegrationIds.length > 0) {
        return { kind: 'configured', integrationIds: configuredIntegrationIds };
    }
    if (instantSetup === 'managed') {
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
