import Fuse from 'fuse.js';
import countBy from 'lodash/countBy';
import debounce from 'lodash/debounce';
import { MessageSquarePlus, Search, Zap } from 'lucide-react';
import { parseAsString, useQueryState } from 'nuqs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';

import { InputGroup, InputGroupAddon, InputGroupInput } from '@nangohq/design-system';

import { ButtonLink } from '@/components/ui/ButtonLink';
import { EmptyCard } from '@/components/ui/EmptyCard';
import { Skeleton } from '@/components/ui/Skeleton';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { useListIntegrations } from '@/hooks/useIntegration';
import { useProviders } from '@/hooks/useProviders';
import DashboardLayout from '@/layout/DashboardLayout';
import { useStore } from '@/store';
import { track } from '@/utils/analytics';
import { getFilterLabel, listBrowsableCategories, matchesFilter, NANGO_MANAGED_FILTER } from './categories';
import { FilterPill } from './components/FilterPill';
import { ProviderCard } from './components/ProviderCard';

import type { ApiProviderListItem } from '@nangohq/types';

export const CatalogList = () => {
    const env = useStore((state) => state.env);
    const { data: providersData, isLoading } = useProviders(env);
    const { data: integrationsData } = useListIntegrations(env);
    const [results, setResults] = useState<ApiProviderListItem[] | null>(null);
    const [category, setCategory] = useQueryState('category', parseAsString);

    const providers = useMemo(() => providersData?.data ?? [], [providersData]);
    const providersByPopularity = useMemo(() => sortByPopularity(providers), [providers]);

    const categories = useMemo(() => listBrowsableCategories(providers), [providers]);
    const filterCounts = useMemo<Record<string, number>>(
        () => ({
            ...countBy(providers.flatMap((provider) => provider.categories ?? [])),
            [NANGO_MANAGED_FILTER]: providers.filter((provider) => provider.preConfigured).length
        }),
        [providers]
    );
    const visibleProviders = useMemo(() => filterByCategory(results ?? providersByPopularity, category), [results, providersByPopularity, category]);

    const integrationCounts = useMemo(() => countBy(integrationsData?.data, (integration) => integration.provider), [integrationsData]);

    const fuse = useMemo(
        () =>
            new Fuse(providers, {
                keys: [
                    { name: 'displayName', weight: 0.6 },
                    { name: 'name', weight: 0.4 }
                ],
                threshold: 0.3,
                minMatchCharLength: 1,
                ignoreLocation: true
            }),
        [providers]
    );

    const trackSearch = useMemo(
        () =>
            debounce((query: string, resultCount: number) => {
                track('catalog:filter_update', { filter: 'search', result_count: resultCount, ...(resultCount === 0 && { query }) });
            }, 1000),
        []
    );

    const search = useCallback(
        (value: string) => {
            const query = value.trim();
            if (!query) {
                trackSearch.cancel();
                setResults(null);
                return;
            }

            const matches = fuse.search(query).map((result) => result.item);
            setResults(matches);
            trackSearch(query, matches.length);
        },
        [fuse, trackSearch]
    );

    const debouncedSearch = useMemo(() => debounce(search, 300), [search]);

    const onCategoryClick = (value: string | null) => {
        void setCategory(value);
        if (value) {
            track('catalog:filter_update', { filter: 'category', category: value, result_count: filterCounts[value] ?? 0 });
        }
    };

    useEffect(() => {
        return () => {
            debouncedSearch.cancel();
            trackSearch.flush();
        };
    }, [debouncedSearch, trackSearch]);

    return (
        <DashboardLayout fullWidth title="Catalog" className="flex flex-col gap-6">
            <Helmet>
                <title>Catalog - Nango</title>
            </Helmet>

            <div className="flex items-baseline gap-2">
                <span className="text-text-strong text-title-section">{isLoading ? '…' : providers.length.toLocaleString()}</span>
                <span className="text-text-secondary text-body-medium-regular">APIs, with auth handled for you</span>
            </div>

            <div className="flex flex-col gap-3">
                <InputGroup className="bg-surface-panel-inset">
                    <InputGroupInput
                        type="text"
                        placeholder="Search APIs, like GitHub or Salesforce"
                        onChange={(e) => debouncedSearch(e.currentTarget.value)}
                        autoFocus
                    />
                    <InputGroupAddon>
                        <Search />
                    </InputGroupAddon>
                </InputGroup>

                {categories.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        <FilterPill label="All" selected={!category} onClick={() => onCategoryClick(null)} />
                        {[NANGO_MANAGED_FILTER, ...categories].map((value) => (
                            <FilterPill
                                key={value}
                                label={getFilterLabel(value)}
                                icon={value === NANGO_MANAGED_FILTER ? <Zap className="size-3 text-text-brand" /> : undefined}
                                highlighted={value === NANGO_MANAGED_FILTER}
                                count={filterCounts[value]}
                                selected={category === value}
                                onClick={() => onCategoryClick(category === value ? null : value)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {isLoading ? (
                <ProviderGrid>
                    {Array.from({ length: 12 }).map((_, index) => (
                        <Skeleton key={index} className="h-18.5 w-full" />
                    ))}
                </ProviderGrid>
            ) : visibleProviders.length === 0 ? (
                <EmptyCard>
                    <p className="text-text-secondary text-body-medium-regular">No APIs match your search.</p>
                    <ButtonLink to="https://nango.dev/docs/integrations/contribute-or-request-api" target="_blank" variant="secondary">
                        <MessageSquarePlus /> Request an API
                    </ButtonLink>
                </EmptyCard>
            ) : (
                <ProviderSection
                    title={`${visibleProviders.length.toLocaleString()} ${visibleProviders.length === 1 ? 'API' : 'APIs'}`}
                    providers={visibleProviders}
                    integrationCounts={integrationCounts}
                />
            )}
        </DashboardLayout>
    );
};

const ProviderGrid = ({ children }: { children: React.ReactNode }) => {
    return (
        <div className="@container">
            <div className="grid grid-cols-1 @xl:grid-cols-2 @5xl:grid-cols-3 gap-3">{children}</div>
        </div>
    );
};

const BATCH_SIZE = 60;

const ProviderSection = ({
    title,
    providers,
    integrationCounts
}: {
    title: string;
    providers: ApiProviderListItem[];
    integrationCounts: Record<string, number>;
}) => {
    const [renderedCount, setRenderedCount] = useState(BATCH_SIZE);
    const sentinelRef = useInfiniteScroll({
        hasNextPage: renderedCount < providers.length,
        isFetchingNextPage: false,
        fetchNextPage: () => setRenderedCount((count) => count + BATCH_SIZE)
    });

    useEffect(() => {
        setRenderedCount(BATCH_SIZE);
    }, [providers]);

    return (
        <section className="flex flex-col gap-3">
            <h2 className="text-text-secondary text-body-small-semi">{title}</h2>
            <ProviderGrid>
                {providers.slice(0, renderedCount).map((provider) => (
                    <ProviderCard key={provider.name} provider={provider} integrationCount={integrationCounts[provider.name] ?? 0} />
                ))}
            </ProviderGrid>
            <div ref={sentinelRef} />
        </section>
    );
};

function filterByCategory(providers: ApiProviderListItem[], category: string | null): ApiProviderListItem[] {
    return category ? providers.filter((provider) => matchesFilter(provider, category)) : providers;
}

function sortByPopularity(providers: ApiProviderListItem[]): ApiProviderListItem[] {
    const isPopular = (provider: ApiProviderListItem) => (provider.categories?.includes('popular') ? 0 : 1);
    return [...providers].sort((a, b) => isPopular(a) - isPopular(b));
}
