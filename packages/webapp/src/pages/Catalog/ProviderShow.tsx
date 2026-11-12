import { ArrowUpRight } from 'lucide-react';
import { useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { useParams } from 'react-router-dom';

import { Alert, AlertDescription, Badge, Button } from '@nangohq/design-system';

import { ErrorPageComponent } from '@/components/patterns/ErrorComponent';
import { PermissionGate } from '@/components/patterns/PermissionGate';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Skeleton } from '@/components/ui/Skeleton';
import { useListIntegrations } from '@/hooks/useIntegration';
import { useGetProviderTemplates } from '@/hooks/useIntegrationFunctions';
import { usePermissions } from '@/hooks/usePermissions';
import { useProviders } from '@/hooks/useProviders';
import DashboardLayout from '@/layout/DashboardLayout';
import { useStore } from '@/store';
import { getDisplayName } from '../Integrations/utils';
import PageNotFound from '../PageNotFound';
import { trackSetupButtonClick } from './analytics';
import { countIntegrationsByProvider, getCategoryLabel, getInstantSetup, getVisibleCategories, isMcp } from './catalog.utils';
import { CatalogFunctions } from './components/CatalogFunctions';
import { CatalogLogo } from './components/CatalogLogo';
import { ProviderCallout } from './components/ProviderCallout';

import type { SetupButtonSource } from './analytics';
import type { ProviderCalloutState } from './components/ProviderCallout';
import type { ApiProviderListItem, GetProviders } from '@nangohq/types';

export const CatalogProviderShow: React.FC = () => {
    const env = useStore((state) => state.env);
    const { provider: providerName = '' } = useParams();
    const { data: providersData, isPending, error } = useProviders(env);
    const { data: integrationsData, isSuccess: integrationsLoaded } = useListIntegrations(env);
    const { can } = usePermissions();
    const canSetUp = can('environment:integrations:update');
    const { data: templatesData, isPending: templatesPending, error: templatesError } = useGetProviderTemplates({ env, provider: providerName });

    const provider = providersData?.data.find((item) => item.name === providerName);
    const configuredCount = useMemo(
        () => (integrationsLoaded ? (countIntegrationsByProvider(integrationsData?.data ?? []).get(providerName) ?? 0) : null),
        [integrationsLoaded, integrationsData, providerName]
    );

    if (error) {
        return <ErrorPageComponent title="Catalog" error={error.json as GetProviders['Errors']} />;
    }
    if (isPending) {
        return (
            <DashboardLayout fullWidth>
                <Skeleton className="h-24 w-full" />
            </DashboardLayout>
        );
    }
    if (!provider) {
        return <PageNotFound />;
    }

    const calloutState = getCalloutState(provider, configuredCount);
    const renderSetupButton = (source: SetupButtonSource, size: 'sm' | 'md') => (
        <PermissionGate asChild condition={canSetUp}>
            {(allowed) => (
                <ButtonLink
                    to={`/${env}/integrations/create/${provider.name}`}
                    variant="primary"
                    size={size}
                    disabled={!allowed}
                    onClick={() => trackSetupButtonClick(provider.name, source)}
                >
                    Set up {provider.displayName}
                </ButtonLink>
            )}
        </PermissionGate>
    );
    const instantSetup = getInstantSetup(provider);
    const categories = getVisibleCategories(provider);

    return (
        <DashboardLayout fullWidth hasPageHeading breadcrumbLabel={provider.displayName} className="flex flex-col gap-6">
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
                    {renderSetupButton('header', 'md')}
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
                    renderSetupButton={() => renderSetupButton('panel', 'sm')}
                />
            )}
        </DashboardLayout>
    );
};

function getCalloutState(provider: ApiProviderListItem, configuredCount: number | null): ProviderCalloutState {
    if (configuredCount === null) {
        return { kind: 'none' };
    }
    if (configuredCount > 0) {
        return { kind: 'configured', count: configuredCount };
    }
    const instantSetup = getInstantSetup(provider);
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
