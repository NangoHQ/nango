import Fuse from 'fuse.js';
import debounce from 'lodash/debounce';
import { Check, ChevronDown } from 'lucide-react';
import { parseAsBoolean, parseAsString, parseAsStringLiteral, useQueryState } from 'nuqs';
import { useDeferredValue, useEffect, useMemo, useRef } from 'react';
import { Helmet } from 'react-helmet';

import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@nangohq/design-system';

import { ErrorPageComponent } from '@/components/patterns/ErrorComponent';
import { CountBadge } from '@/components/ui/CountBadge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/DropdownMenu';
import { Skeleton } from '@/components/ui/Skeleton';
import { Switch } from '@/components/ui/Switch';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { useListIntegrations } from '@/hooks/useIntegration';
import { useProviders } from '@/hooks/useProviders';
import { useSearchQueryState } from '@/hooks/useSearchQueryState';
import DashboardLayout from '@/layout/DashboardLayout';
import { useStore } from '@/store';
import { trackCatalogFilter } from './analytics';
import { countIntegrationsByProvider, filterProviders, getCategoryLabel, listCategories, sortProviders } from './catalog.utils';
import { CatalogCard } from './components/CatalogCard';
import { CategoryRail } from './components/CategoryRail';
import { NoMatchesState } from './components/NoMatchesState';
import { SearchField } from './components/SearchField';
import { useCatalogPlace } from './useCatalogPlace';

import type { CatalogFilter } from './analytics';
import type { CatalogSort } from './catalog.utils';
import type { ActiveFilter } from './components/NoMatchesState';
import type { DebouncedFunc } from 'lodash';

const SORT_LABELS: Record<CatalogSort, string> = { popular: 'Popular first', alphabetical: 'A–Z' };
const GRID_CLASSES = 'grid grid-cols-2 gap-2 xl:grid-cols-3 3xl:grid-cols-4 4xl:grid-cols-5';
const FILTERS: CatalogFilter[] = ['search', 'category', 'instant_setup', 'sort'];

function createFilterTrackers(getResultCount: () => number) {
    return Object.fromEntries(FILTERS.map((filter) => [filter, debounce(() => trackCatalogFilter(filter, getResultCount()), 1000)])) as Record<
        CatalogFilter,
        DebouncedFunc<() => void>
    >;
}

function getResultsTitle(query: string, category: string | null): string {
    if (query) {
        return `Results for “${query}”`;
    }
    return category ? getCategoryLabel(category) : 'All APIs';
}

export const CatalogShow: React.FC = () => {
    const env = useStore((state) => state.env);
    const { data: providersData, isPending, error } = useProviders(env);
    const { data: integrationsData } = useListIntegrations(env);

    const [search, setSearch] = useSearchQueryState();
    const [category, setCategory] = useQueryState('category', parseAsString);
    const [instantOnly, setInstantOnly] = useQueryState('instant', parseAsBoolean.withDefault(false));
    const [sort, setSort] = useQueryState('sort', parseAsStringLiteral(['popular', 'alphabetical'] as const).withDefault('popular'));

    const debouncedSearch = useDebouncedValue(search);
    const isSearching = debouncedSearch.trim() !== '';

    const providers = useMemo(() => providersData?.data ?? [], [providersData]);
    const integrationCounts = useMemo(() => countIntegrationsByProvider(integrationsData?.data ?? []), [integrationsData]);

    const categories = useMemo(() => listCategories(filterProviders(providers, { category: null, instantOnly })), [providers, instantOnly]);
    const instantCount = useMemo(() => filterProviders(providers, { category: null, instantOnly }).length, [providers, instantOnly]);

    const scopeCount = useMemo(() => filterProviders(providers, { category, instantOnly: false }).length, [providers, category]);
    const filtered = useMemo(() => filterProviders(providers, { category, instantOnly }), [providers, category, instantOnly]);
    const results = useMemo(() => {
        const query = debouncedSearch.trim();
        if (!query) {
            return sortProviders(filtered, sort);
        }
        const fuse = new Fuse(filtered, {
            keys: [
                { name: 'displayName', weight: 0.6 },
                { name: 'name', weight: 0.4 }
            ],
            threshold: 0.3,
            ignoreLocation: true
        });
        return fuse.search(query).map((result) => result.item);
    }, [filtered, debouncedSearch, sort]);
    const deferredResults = useDeferredValue(results);

    const scrollRef = useRef<HTMLDivElement | null>(null);
    const { visibleCount, loadMore, isLoadingMore } = useCatalogPlace({
        scrollRef,
        filterKey: JSON.stringify([category, instantOnly, sort, debouncedSearch]),
        isReady: !isPending && deferredResults === results
    });
    const sentinelRef = useInfiniteScroll({
        hasNextPage: visibleCount < deferredResults.length,
        isFetchingNextPage: isLoadingMore,
        fetchNextPage: loadMore,
        threshold: 600
    });

    const resultCountRef = useRef(0);
    useEffect(() => {
        resultCountRef.current = results.length;
    }, [results]);
    const trackFilter = useMemo(() => createFilterTrackers(() => resultCountRef.current), []);
    useEffect(
        () => () => {
            for (const tracker of Object.values(trackFilter)) {
                tracker.flush();
            }
        },
        [trackFilter]
    );

    if (error && !providersData) {
        return <ErrorPageComponent title="Catalog" error={error} />;
    }

    const visible = deferredResults.slice(0, visibleCount);

    const query = debouncedSearch.trim();
    const activeFilters: ActiveFilter[] = [
        ...(query ? [{ key: 'search', label: 'Search', value: `“${query}”`, onRemove: () => setSearch('') }] : []),
        ...(category ? [{ key: 'category', label: 'Category', value: getCategoryLabel(category), onRemove: () => void setCategory(null) }] : []),
        ...(instantOnly ? [{ key: 'instant', label: 'Filter', value: 'Instant setup', onRemove: () => void setInstantOnly(null) }] : [])
    ];
    const clearAllFilters = () => {
        for (const filter of activeFilters) {
            filter.onRemove();
        }
    };

    return (
        <DashboardLayout ref={scrollRef} fullWidth className="p-0">
            <Helmet>
                <title>Catalog - Nango</title>
            </Helmet>
            <div className="flex">
                <CategoryRail
                    categories={categories}
                    totalCount={instantCount}
                    selected={category}
                    onSelect={(next) => {
                        void setCategory(next);
                        trackFilter.category();
                    }}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-6 px-6 pt-6 pb-16">
                    <SearchField
                        value={search}
                        placeholder={`Search ${providers.length.toLocaleString('en-US')} APIs, like GitHub or Salesforce`}
                        onChange={(value) => {
                            setSearch(value);
                            if (value.trim()) {
                                trackFilter.search();
                            } else {
                                trackFilter.search.cancel();
                            }
                        }}
                    />

                    <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                                <h2 className="type-text-medium-md text-text-strong">{getResultsTitle(query, category)}</h2>
                                {!isPending && <CountBadge count={results.length} total={results.length === scopeCount ? undefined : scopeCount} />}
                            </div>
                            <div className="flex items-center gap-4">
                                {isSearching ? (
                                    <span className="type-text-regular-sm text-text-muted">Sorted by best match</span>
                                ) : (
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="md">
                                                <span className="text-text-muted">Sort</span>
                                                {SORT_LABELS[sort]}
                                                <ChevronDown />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-40">
                                            {(Object.keys(SORT_LABELS) as CatalogSort[]).map((option) => (
                                                <DropdownMenuItem
                                                    key={option}
                                                    className="h-7 gap-2 text-body-medium-regular text-text-secondary"
                                                    onSelect={() => {
                                                        if (option === sort) {
                                                            return;
                                                        }
                                                        void setSort(option === 'alphabetical' ? 'alphabetical' : null);
                                                        trackFilter.sort();
                                                    }}
                                                >
                                                    {SORT_LABELS[option]}
                                                    {option === sort && <Check className="ml-auto size-3.5 text-text-muted" />}
                                                </DropdownMenuItem>
                                            ))}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                )}
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <label className="flex cursor-pointer items-center gap-2 type-text-regular-sm text-text-default">
                                            <Switch
                                                checked={instantOnly}
                                                onCheckedChange={(checked) => {
                                                    void setInstantOnly(checked || null);
                                                    trackFilter.instant_setup();
                                                }}
                                            />
                                            Instant setup only
                                        </label>
                                    </TooltipTrigger>
                                    <TooltipContent>No developer app to register: Nango-managed OAuth, API key, basic auth and similar</TooltipContent>
                                </Tooltip>
                            </div>
                        </div>

                        {isPending ? (
                            <div className={GRID_CLASSES}>
                                {Array.from({ length: 12 }, (_, index) => (
                                    <Skeleton key={index} className="h-16 rounded-ds-md" />
                                ))}
                            </div>
                        ) : visible.length === 0 ? (
                            <NoMatchesState filters={activeFilters} onClearAll={clearAllFilters} />
                        ) : (
                            <div className={GRID_CLASSES}>
                                {visible.map((provider) => (
                                    <CatalogCard key={provider.name} provider={provider} env={env} isConfigured={integrationCounts.has(provider.name)} />
                                ))}
                            </div>
                        )}

                        <div ref={sentinelRef} aria-hidden />
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
};
