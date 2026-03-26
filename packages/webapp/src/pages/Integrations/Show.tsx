import { useVirtualizer } from '@tanstack/react-virtual';
import Fuse from 'fuse.js';
import debounce from 'lodash/debounce';
import { Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';

import { AuthBadge } from './components/AuthBadge';
import { AutoIdlingBanner } from './components/AutoIdlingBanner';
import { ErrorPageComponent } from '@/components/ErrorComponent';
import { CopyButton } from '@/components-v2/CopyButton';
import { IntegrationLogo } from '@/components-v2/IntegrationLogo';
import { Badge } from '@/components-v2/ui/badge';
import { Button } from '@/components-v2/ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components-v2/ui/input-group';
import { Skeleton } from '@/components-v2/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components-v2/ui/table';
import { useListIntegrations } from '@/hooks/useIntegration';
import { useProviders } from '@/hooks/useProviders';
import DashboardLayout from '@/layout/DashboardLayout';
import { useStore } from '@/store';

import type { ApiIntegrationList, ApiProviderListItem, GetIntegrations } from '@nangohq/types';
import type { VirtualItem, Virtualizer } from '@tanstack/react-virtual';

type Filter = 'all' | 'connected' | 'not_connected';

export const IntegrationsList = () => {
    const navigate = useNavigate();
    const env = useStore((state) => state.env);

    const { data: integrationsData, isPending: integrationsPending, error } = useListIntegrations(env);
    const { data: providersData, isLoading: providersPending } = useProviders(env);

    const [filter, setFilter] = useState<Filter>('all');
    const [searchValue, setSearchValue] = useState('');

    const integrations = useMemo(() => integrationsData?.data ?? [], [integrationsData]);
    const providers = useMemo(() => providersData?.data ?? [], [providersData]);

    const connectedProviderNames = useMemo(() => {
        return new Set(integrations.map((i) => i.provider));
    }, [integrations]);

    // Build a unified list of providers with their connection info
    const allItems = useMemo(() => {
        return providers.map((provider) => ({
            provider,
            integration: integrations.find((i) => i.provider === provider.name) ?? null,
            connected: connectedProviderNames.has(provider.name)
        }));
    }, [providers, integrations, connectedProviderNames]);

    const filteredByTab = useMemo(() => {
        switch (filter) {
            case 'connected':
                return allItems.filter((item) => item.connected);
            case 'not_connected':
                return allItems.filter((item) => !item.connected);
            default:
                return allItems;
        }
    }, [allItems, filter]);

    const fuse = useMemo(() => {
        if (filteredByTab.length === 0) {
            return null;
        }

        return new Fuse(filteredByTab, {
            keys: [
                { name: 'provider.displayName', weight: 0.3 },
                { name: 'provider.name', weight: 0.3 },
                { name: 'provider.authMode', weight: 0.2 },
                { name: 'provider.categories', weight: 0.2 }
            ],
            threshold: 0.4,
            includeScore: true,
            minMatchCharLength: 1,
            ignoreLocation: true,
            findAllMatches: true
        });
    }, [filteredByTab]);

    const displayItems = useMemo(() => {
        if (!searchValue.trim() || !fuse) {
            return filteredByTab;
        }
        return fuse.search(searchValue).map((result) => result.item);
    }, [searchValue, fuse, filteredByTab]);

    const debouncedSetSearch = useMemo(() => debounce((value: string) => setSearchValue(value), 300), []);

    useEffect(() => {
        return () => {
            debouncedSetSearch.cancel();
        };
    }, [debouncedSetSearch]);

    const handleInputChange = useCallback(
        (event: React.ChangeEvent<HTMLInputElement>) => {
            debouncedSetSearch(event.currentTarget.value);
        },
        [debouncedSetSearch]
    );

    const isPending = integrationsPending || providersPending;

    if (error) {
        return <ErrorPageComponent title="Integrations" error={error.json as GetIntegrations['Errors']} />;
    }

    return (
        <DashboardLayout fullWidth className="flex flex-col gap-8">
            <Helmet>
                <title>Integrations - Nango</title>
            </Helmet>
            <header className="flex justify-between items-center">
                <h2 className="text-text-primary text-title-subsection">Integrations</h2>
            </header>

            <div className="flex items-center gap-4">
                <div className="flex gap-1">
                    <FilterButton active={filter === 'all'} onClick={() => setFilter('all')}>
                        All
                    </FilterButton>
                    <FilterButton active={filter === 'connected'} onClick={() => setFilter('connected')}>
                        Connected ({integrations.length})
                    </FilterButton>
                    <FilterButton active={filter === 'not_connected'} onClick={() => setFilter('not_connected')}>
                        Not Connected ({providers.length - connectedProviderNames.size})
                    </FilterButton>
                </div>
            </div>

            <InputGroup className="bg-bg-subtle">
                <InputGroupInput type="text" placeholder="Search integrations..." onChange={handleInputChange} autoFocus />
                <InputGroupAddon>
                    <Search />
                </InputGroupAddon>
            </InputGroup>

            <AutoIdlingBanner />

            {isPending && (
                <div className="flex flex-col gap-1">
                    <Skeleton className="h-10 w-full" />
                    {Array.from({ length: 4 }).map((_, index) => (
                        <Skeleton className="h-13 w-full" key={index} />
                    ))}
                </div>
            )}

            {!isPending && displayItems.length === 0 && (
                <div className="flex flex-col gap-5 p-20 items-center justify-center bg-bg-elevated rounded">
                    <h3 className="text-title-body text-text-primary">No integrations found</h3>
                    <p className="text-text-secondary text-body-medium-regular">
                        {searchValue ? 'Could not find any integrations matching your search.' : 'No integrations available for this filter.'}
                    </p>
                </div>
            )}

            {!isPending && displayItems.length > 0 && filter === 'connected' && <ConnectedList items={displayItems} env={env} navigate={navigate} />}

            {!isPending && displayItems.length > 0 && filter !== 'connected' && <ProviderList items={displayItems} env={env} navigate={navigate} />}
        </DashboardLayout>
    );
};

const FilterButton = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => {
    return (
        <Button variant={active ? 'primary' : 'ghost'} size="sm" onClick={onClick}>
            {children}
        </Button>
    );
};

interface UnifiedItem {
    provider: ApiProviderListItem;
    integration: ApiIntegrationList | null;
    connected: boolean;
}

const ConnectedList = ({ items, env, navigate }: { items: UnifiedItem[]; env: string; navigate: ReturnType<typeof useNavigate> }) => {
    return (
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
                {items.map((item) => {
                    const integration = item.integration!;
                    return (
                        <TableRow
                            key={integration.unique_key}
                            className="h-14 cursor-pointer"
                            onClick={() => {
                                navigate(`/${env}/integrations/${integration.unique_key}`);
                            }}
                        >
                            <TableCell className="text-text-primary text-body-small-semi">
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
                            <TableCell className="text-text-primary text-body-small-semi text-center">{integration.meta.connectionCount}</TableCell>
                            <TableCell>
                                <AuthBadge authMode={integration.meta.authMode} />
                            </TableCell>
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
    );
};

const ProviderList = ({ items, env, navigate }: { items: UnifiedItem[]; env: string; navigate: ReturnType<typeof useNavigate> }) => {
    const parentRef = useRef<HTMLDivElement>(null);

    const rowVirtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
        count: items.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 74,
        overscan: 5,
        gap: 8
    });

    return (
        <div ref={parentRef} className="h-full overflow-auto">
            <div className="relative" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const item = items[virtualRow.index];
                    return (
                        <ProviderRow key={virtualRow.key} item={item} env={env} navigate={navigate} virtualRow={virtualRow} rowVirtualizer={rowVirtualizer} />
                    );
                })}
            </div>
        </div>
    );
};

const ProviderRow = ({
    item,
    env,
    navigate,
    virtualRow,
    rowVirtualizer
}: {
    item: UnifiedItem;
    env: string;
    navigate: ReturnType<typeof useNavigate>;
    virtualRow: VirtualItem;
    rowVirtualizer: Virtualizer<HTMLDivElement, HTMLDivElement>;
}) => {
    const onClick = () => {
        if (item.integration) {
            navigate(`/${env}/integrations/${item.integration.unique_key}`);
        } else {
            navigate(`/${env}/integrations/create/${item.provider.name}`);
        }
    };

    return (
        <div
            onClick={onClick}
            className="p-4 w-full inline-flex items-center justify-between bg-bg-elevated rounded border border-transparent cursor-pointer transition-colors hover:bg-bg-surface hover:border-border-disabled"
            data-index={virtualRow.index}
            ref={(node) => rowVirtualizer.measureElement(node)}
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`
            }}
        >
            <div className="inline-flex gap-1.5 items-center">
                <IntegrationLogo provider={item.provider.name} />
                <span className="text-text-primary text-body-medium-semi">{item.provider.displayName}</span>
                {item.connected && (
                    <Badge variant="ghost" className="text-green-600">
                        Connected
                    </Badge>
                )}
            </div>
            <div className="inline-flex gap-1.5 items-center justify-end">
                <AuthBadge authMode={item.provider.authMode} />
                {item.provider.categories?.map((category) => (
                    <Badge key={category} variant="ghost">
                        {category}
                    </Badge>
                ))}
            </div>
        </div>
    );
};
