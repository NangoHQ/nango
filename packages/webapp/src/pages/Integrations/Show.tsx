import Fuse from 'fuse.js';
import debounce from 'lodash/debounce';
import { Search } from 'lucide-react';
import { parseAsString, useQueryState } from 'nuqs';
import { useEffect, useMemo, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';

import { InputGroup, InputGroupAddon, InputGroupInput, LinkButton } from '@nangohq/design-system';

import { ErrorPageComponent } from '@/components/patterns/ErrorComponent';
import { IntegrationLogo } from '@/components/patterns/IntegrationLogo';
import { PermissionGate } from '@/components/patterns/PermissionGate';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { CopyButton } from '@/components/ui/CopyButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useListIntegrations } from '@/hooks/useIntegration';
import { usePermissions } from '@/hooks/usePermissions';
import { useSearchQueryState } from '@/hooks/useSearchQueryState';
import DashboardLayout from '@/layout/DashboardLayout';
import { useStore } from '@/store';
import { track } from '@/utils/analytics';
import { AuthBadge } from './components/AuthBadge';
import { AutoIdlingBanner } from './components/AutoIdlingBanner';

export const IntegrationsList = () => {
    const navigate = useNavigate();

    const env = useStore((state) => state.env);
    const { data, isPending, error } = useListIntegrations(env);
    const [search, setSearch] = useSearchQueryState();
    const debouncedSearch = useDebouncedValue(search);
    const [providerFilter, setProviderFilter] = useQueryState('provider', parseAsString);

    const { can } = usePermissions();
    const canWriteIntegration = can('environment:integrations:update');

    const initialIntegrations = useMemo(() => {
        if (!data?.data || !providerFilter) {
            return data?.data ?? null;
        }
        return data.data.filter((integration) => integration.provider === providerFilter);
    }, [data?.data, providerFilter]);
    const integrationsCount = initialIntegrations?.length ?? 0;

    const fuse = useMemo(() => {
        if (!initialIntegrations || initialIntegrations.length === 0) {
            return null;
        }

        return new Fuse(initialIntegrations, {
            keys: [
                { name: 'meta.displayName', weight: 0.3 },
                { name: 'provider', weight: 0.3 },
                { name: 'unique_key', weight: 0.2 },
                { name: 'meta.authMode', weight: 0.2 }
            ],
            threshold: 0.4, // 0.0 = exact match, 1.0 = match anything. 0.4 is a good balance
            includeScore: true,
            minMatchCharLength: 1,
            ignoreLocation: true, // Search anywhere in the string
            findAllMatches: true // Find all matches, not just the first
        });
    }, [initialIntegrations]);

    const integrations = useMemo(() => {
        if (!initialIntegrations || !debouncedSearch.trim() || !fuse) {
            return initialIntegrations;
        }
        return fuse.search(debouncedSearch).map((result) => result.item);
    }, [initialIntegrations, debouncedSearch, fuse]);

    const resultCountRef = useRef(0);
    useEffect(() => {
        resultCountRef.current = integrations?.length ?? 0;
    }, [integrations]);

    const trackSearch = useMemo(
        () => debounce(() => track('integrations:filter_update', { filter: 'search', result_count: resultCountRef.current }), 1000),
        []
    );

    useEffect(() => {
        return () => {
            trackSearch.flush();
        };
    }, [trackSearch]);

    const onSearchChange = (value: string) => {
        setSearch(value);
        if (value.trim()) {
            trackSearch();
        } else {
            trackSearch.cancel();
        }
    };

    if (error && !data) {
        return <ErrorPageComponent title="Integrations" error={error} />;
    }

    return (
        <DashboardLayout className="flex flex-col gap-3">
            <Helmet>
                <title>Integrations - Nango</title>
            </Helmet>
            <header className="flex items-center gap-3">
                <InputGroup className="flex-1">
                    <InputGroupInput
                        type="text"
                        placeholder="Search integration"
                        value={search}
                        onChange={(event) => onSearchChange(event.currentTarget.value)}
                    />
                    <InputGroupAddon>
                        <Search />
                    </InputGroupAddon>
                </InputGroup>
                <PermissionGate asChild condition={canWriteIntegration}>
                    {(allowed) => (
                        <ButtonLink disabled={!allowed} to={`/${env}/catalog`} size="md">
                            Set up new integration
                        </ButtonLink>
                    )}
                </PermissionGate>
            </header>

            {!isPending && data?.data && data.data.length > 0 && (
                <div className="flex items-center justify-between gap-3">
                    {providerFilter ? (
                        <div className="flex items-center gap-2 text-text-secondary text-body-small-regular">
                            <span>Showing {initialIntegrations?.[0]?.meta.displayName ?? providerFilter} integrations</span>
                            <LinkButton size="sm" onClick={() => void setProviderFilter(null)}>
                                Show all
                            </LinkButton>
                        </div>
                    ) : (
                        <span />
                    )}
                    <span className="text-text-muted text-body-small-regular">
                        {integrationsCount} {integrationsCount === 1 ? 'integration' : 'integrations'}
                    </span>
                </div>
            )}

            <AutoIdlingBanner />

            {isPending && (
                <div className="flex flex-col gap-1">
                    <Skeleton className="h-10 w-full" />
                    {Array.from({ length: 4 }).map((_, index) => (
                        <Skeleton className="h-13 w-full" key={index} />
                    ))}
                </div>
            )}

            {data?.data && data.data.length === 0 && (
                <div className="flex flex-col gap-5 p-20 items-center justify-center bg-surface-panel rounded">
                    <h3 className="text-title-body text-text-strong">No available integrations</h3>
                    <p className="text-text-secondary text-body-medium-regular">You don’t have any integrations set up yet with Nango.</p>
                    <PermissionGate asChild condition={canWriteIntegration}>
                        {(allowed) => (
                            <ButtonLink disabled={!allowed} to={`/${env}/catalog`} size="lg">
                                Set up new integration
                            </ButtonLink>
                        )}
                    </PermissionGate>
                </div>
            )}

            {data?.data && data.data.length > 0 && integrations && integrations.length === 0 && (
                <div className="flex flex-col gap-5 p-20 items-center justify-center bg-surface-panel rounded">
                    <h3 className="text-title-body text-text-strong">No integrations found</h3>
                    <p className="text-text-secondary text-body-medium-regular">Could not find any integrations matching your search.</p>
                    <PermissionGate asChild condition={canWriteIntegration}>
                        {(allowed) => (
                            <ButtonLink disabled={!allowed} to={`/${env}/catalog`} size="lg">
                                Set up new integration
                            </ButtonLink>
                        )}
                    </PermissionGate>
                </div>
            )}

            {integrations && integrations.length > 0 && (
                <Table>
                    <TableHeader className="h-11">
                        <TableRow>
                            <TableHead className="w-4/12">Name</TableHead>
                            <TableHead className="w-3/12">ID</TableHead>
                            <TableHead className="w-3/12 text-center">Connections</TableHead>
                            <TableHead className="w-2/12">Auth Type</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {integrations.map((integration) => (
                            <TableRow
                                key={integration.unique_key}
                                className="h-14 cursor-pointer"
                                onClick={() => {
                                    navigate(`/${env}/integrations/${integration.unique_key}`);
                                }}
                            >
                                <TableCell className="text-text-strong text-body-small-semi">
                                    <div className="flex gap-1.5 items-center">
                                        <IntegrationLogo provider={integration.provider} />
                                        {integration.display_name || integration.meta.displayName}
                                    </div>
                                </TableCell>
                                <TableCell className="text-text-secondary !text-body-small-regular">
                                    <div className="flex gap-1.5 items-center">
                                        {integration.unique_key}
                                        <CopyButton text={integration.unique_key} />
                                    </div>
                                </TableCell>
                                <TableCell className="text-text-strong text-body-small-semi text-center">{integration.meta.connectionCount}</TableCell>
                                <TableCell>
                                    <AuthBadge authMode={integration.meta.authMode} />
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
        </DashboardLayout>
    );
};
