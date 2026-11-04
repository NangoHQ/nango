import { BookOpen, ChevronRight, Code, Search, Zap } from 'lucide-react';
import { parseAsString, useQueryState } from 'nuqs';
import { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useParams } from 'react-router-dom';

import { InputGroup, InputGroupAddon, InputGroupInput } from '@nangohq/design-system';

import { ErrorPageComponent } from '@/components/patterns/ErrorComponent';
import { IntegrationLogo } from '@/components/patterns/IntegrationLogo';
import { PermissionGate } from '@/components/patterns/PermissionGate';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { EmptyCard } from '@/components/ui/EmptyCard';
import { Skeleton } from '@/components/ui/Skeleton';
import { useListIntegrations } from '@/hooks/useIntegration';
import { usePermissions } from '@/hooks/usePermissions';
import { useProvider } from '@/hooks/useProvider';
import { useProviderTemplates } from '@/hooks/useProviderTemplates';
import DashboardLayout from '@/layout/DashboardLayout';
import { useStore } from '@/store';
import { track } from '@/utils/analytics';
import { AuthBadge } from '../Integrations/components/AuthBadge';
import { FilterPill } from './components/FilterPill';
import { FunctionCard } from './components/FunctionCard';
import { FunctionDialog } from './components/FunctionDialog';
import { ProviderLogo } from './components/ProviderLogo';

import type { ApiIntegrationList, ApiProviderListItem, GetProvider } from '@nangohq/types';

type FunctionTypeFilter = 'action' | 'sync';

export const CatalogProvider = () => {
    const env = useStore((state) => state.env);
    const { provider: providerName } = useParams();
    const { data: providerData, isLoading, error } = useProvider(env, providerName);
    const { data: integrationsData } = useListIntegrations(env);

    const provider = providerData?.data;
    const configurations = useMemo(
        () => integrationsData?.data.filter((integration) => integration.provider === providerName) ?? [],
        [integrationsData, providerName]
    );

    const setUpButton = provider && <SetUpButton provider={provider} label={configurations.length > 0 ? 'Set up another' : `Set up ${provider.displayName}`} />;
    const dialogSetUpButton = provider && (
        <SetUpButton
            provider={provider}
            label={configurations.length > 0 ? `Set up another ${provider.displayName} integration` : `Set up ${provider.displayName}`}
        />
    );

    if (error) {
        return <ErrorPageComponent title="Catalog" error={error.json as GetProvider['Errors']} />;
    }

    if (isLoading || !provider) {
        return (
            <DashboardLayout fullWidth className="flex flex-col gap-6">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-50 w-full" />
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout fullWidth className="flex flex-col gap-8">
            <Helmet>
                <title>{provider.displayName} - Catalog - Nango</title>
            </Helmet>

            <header className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-4">
                    <div className="inline-flex gap-2 items-center">
                        <ProviderLogo provider={provider} className="size-10.5" />
                        <h1 className="text-text-strong text-title-subsection">{provider.displayName}</h1>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">{provider.authMode !== 'NONE' && <AuthBadge authMode={provider.authMode} />}</div>
                </div>
                <div className="flex items-center gap-2">
                    <ButtonLink to={provider.docs} target="_blank" variant="outline">
                        <BookOpen />
                        Docs
                    </ButtonLink>
                    {setUpButton}
                </div>
            </header>

            {configurations.length > 0 && <Configurations configurations={configurations} />}

            <ProviderFunctions provider={provider.name} setUpButton={dialogSetUpButton} />
        </DashboardLayout>
    );
};

const SetUpButton = ({ provider, label }: { provider: ApiProviderListItem; label: string }) => {
    const env = useStore((state) => state.env);
    const { can } = usePermissions();

    return (
        <PermissionGate asChild condition={can('environment:integrations:update')}>
            {(allowed) => (
                <ButtonLink disabled={!allowed} to={`/${env}/catalog/${provider.name}/setup`}>
                    {provider.preConfigured && <Zap className="fill-current" />}
                    {label}
                </ButtonLink>
            )}
        </PermissionGate>
    );
};

const Configurations = ({ configurations }: { configurations: ApiIntegrationList[] }) => {
    const env = useStore((state) => state.env);

    return (
        <section className="flex flex-col gap-3">
            <h2 className="text-text-strong text-body-medium-semi">Your integrations</h2>
            <div className="flex flex-col gap-2">
                {configurations.map((integration) => (
                    <Link
                        key={integration.unique_key}
                        to={`/${env}/integrations/${integration.unique_key}`}
                        className="flex items-center justify-between gap-3 px-4 py-3 rounded-md border border-border-muted bg-surface-panel transition-colors hover:bg-state-hover hover:border-border-default"
                    >
                        <div className="flex items-center gap-2 min-w-0">
                            <IntegrationLogo provider={integration.provider} />
                            <span className="truncate text-text-strong text-body-medium-semi">{integration.display_name || integration.meta.displayName}</span>
                            <span className="truncate text-text-secondary text-body-small-regular">{integration.unique_key}</span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                            <span className="text-text-secondary text-body-small-regular">
                                {integration.meta.connectionCount} {integration.meta.connectionCount === 1 ? 'connection' : 'connections'}
                            </span>
                            <ChevronRight className="size-4 text-icon-secondary" />
                        </div>
                    </Link>
                ))}
            </div>
        </section>
    );
};

const ProviderFunctions = ({ provider, setUpButton }: { provider: string; setUpButton: React.ReactNode }) => {
    const env = useStore((state) => state.env);
    const { data, isLoading } = useProviderTemplates(env, provider);
    const [search, setSearch] = useState('');
    const [selectedFunctionName, setSelectedFunctionName] = useQueryState('function', parseAsString);

    const templates = useMemo(() => data?.data ?? [], [data]);
    const actionCount = templates.filter((template) => template.type === 'action').length;
    const syncCount = templates.filter((template) => template.type === 'sync').length;
    const [chosenType, setTypeFilter] = useState<FunctionTypeFilter | null>(null);
    const typeFilter: FunctionTypeFilter = chosenType ?? (actionCount === 0 && syncCount > 0 ? 'sync' : 'action');
    const typeHasFunctions = (typeFilter === 'action' ? actionCount : syncCount) > 0;

    const needle = search.trim().toLowerCase();
    const visible = templates.filter(
        (template) => template.type === typeFilter && (!needle || `${template.name} ${template.description ?? ''}`.toLowerCase().includes(needle))
    );
    const selectedFunction = templates.find((template) => template.type === typeFilter && template.name === selectedFunctionName) ?? null;

    const onCardClick = (name: string) => {
        track('functions:function_view', { provider, function_type: typeFilter, is_deployed: false, is_catalog: true });
        void setSelectedFunctionName(name);
    };

    if (isLoading) {
        return <Skeleton className="w-full h-50" />;
    }

    const pills: { value: FunctionTypeFilter; label: string; count: number }[] = [
        { value: 'action', label: 'Actions', count: actionCount },
        { value: 'sync', label: 'Syncs', count: syncCount }
    ];

    return (
        <div className="flex flex-col gap-4">
            {templates.length > 0 && (
                <div className="flex items-center gap-2">
                    {pills.map((pill) => (
                        <FilterPill
                            key={pill.value}
                            label={pill.label}
                            count={pill.count}
                            selected={pill.value === typeFilter}
                            onClick={() => {
                                void setSelectedFunctionName(null);
                                setTypeFilter(pill.value);
                            }}
                        />
                    ))}
                </div>
            )}

            {!typeHasFunctions ? (
                <EmptyCard>
                    <p className="text-text-secondary text-body-medium-regular">
                        No pre-built {templates.length === 0 ? 'functions' : typeFilter === 'action' ? 'actions' : 'syncs'} yet. Build your own.
                    </p>
                    <ButtonLink to="https://nango.dev/docs/guides/functions/functions-guide" target="_blank" variant="secondary">
                        <Code /> Build custom
                    </ButtonLink>
                </EmptyCard>
            ) : (
                <>
                    <InputGroup>
                        <InputGroupInput
                            type="text"
                            placeholder="Search functions"
                            value={search}
                            onChange={(e) => {
                                void setSelectedFunctionName(null);
                                setSearch(e.target.value);
                            }}
                        />
                        <InputGroupAddon>
                            <Search />
                        </InputGroupAddon>
                    </InputGroup>

                    {visible.length === 0 ? (
                        <EmptyCard>
                            <p className="text-text-secondary text-body-medium-regular">No functions match your search.</p>
                        </EmptyCard>
                    ) : (
                        <div className="@container">
                            <div className="grid grid-cols-1 @xl:grid-cols-2 @5xl:grid-cols-3 gap-3">
                                {visible.map((template) => (
                                    <FunctionCard key={`${template.type}:${template.name}`} fn={template} onClick={() => onCardClick(template.name)} />
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}

            <FunctionDialog fn={selectedFunction} setUpButton={setUpButton} onClose={() => void setSelectedFunctionName(null)} />
        </div>
    );
};
