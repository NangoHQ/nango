import { Check, ChevronsUpDown, Layers, ListFilter, SquareStack, X } from 'lucide-react';
import { useState } from 'react';

import { FilterSelect } from '@/components/patterns/FilterSelect';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/DropdownMenu';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/Tooltip';
import { useApiGetBillingUsageTopDimensionValues, useApiPrefetchBillingUsageTopDimensionValues } from '@/hooks/usePlan';
import { cn } from '@/utils/utils';
import { DIMENSION_LABELS, formatDimensionValue, isSearchableDimension } from '../usageBreakdown';

import type { AnyBreakdownDimension } from '../usageBreakdown';
import type { FilterSelectGroupData } from '@/components/patterns/FilterSelect';
import type { UsageMetric } from '@nangohq/types';

// Trigger styled like the dashboard's other dropdowns. The right padding leaves room for the
// caret (and the clear ✕ when a value is set), which SlotTrigger overlays.
const TRIGGER =
    'flex h-7 w-fit items-center gap-1.5 rounded border border-border-muted bg-surface-overlay py-0.5 pl-1.5 text-s text-text-secondary whitespace-nowrap hover:bg-state-hover focus-default';
const DIM_ITEM = 'h-7 gap-2 text-body-medium-regular text-text-secondary';

/**
 * Wraps a slot's menu trigger as a pill: the trigger button fills the pill, and the open/close
 * caret (plus an optional clear ✕) is overlaid at the right as a SIBLING of the button — never
 * nested inside it, which would be invalid HTML and let the clear control steal the trigger's
 * focus/clicks. The overlay is click-through except the ✕, so the whole pill still opens the menu.
 */
const SlotTrigger: React.FC<{ children: React.ReactNode; onClear?: () => void; clearLabel: string }> = ({ children, onClear, clearLabel }) => (
    <div className="relative inline-flex">
        {children}
        <div className="pointer-events-none absolute inset-y-0 right-1.5 flex items-center gap-1">
            {onClear && (
                <button
                    type="button"
                    aria-label={clearLabel}
                    title={clearLabel}
                    onClick={onClear}
                    className="pointer-events-auto flex items-center text-text-muted hover:text-text-strong"
                >
                    <X className="size-3" />
                </button>
            )}
            <ChevronsUpDown className="size-3 shrink-0 text-text-muted" />
        </div>
    </div>
);

interface BreakdownFilterControlProps {
    metric: UsageMetric;
    env: string;
    timeframe: { start: string; end: string };
    /** All dimensions the metric supports. */
    dimensions: readonly AnyBreakdownDimension[];
    breakdownDimension: AnyBreakdownDimension | null;
    filter: { dimension: AnyBreakdownDimension; value: string } | null;
    onSetBreakdown: (dimension: AnyBreakdownDimension | null) => void;
    onApplyFilter: (dimension: AnyBreakdownDimension, value: string) => void;
    onClearFilter: () => void;
    /** Show "Apply to all" — applying this panel's group + filter would change another panel. */
    canApplyToAll: boolean;
    onApplyToAll: () => void;
}

/**
 * Two independent slots for a usage panel: "Group" (one breakdown dimension, a flat list) and
 * "Filter" (one dimension = value, the reusable {@link FilterSelect} with a searchable value pane
 * per dimension). Both offer every dimension; on a collision the filter wins for the query (see
 * UsageChartCard). The ✕ on a trigger clears that slot; "Apply to all" copies both slots to every
 * metric that supports them.
 */
export const BreakdownFilterControl: React.FC<BreakdownFilterControlProps> = ({
    metric,
    env,
    timeframe,
    dimensions,
    breakdownDimension,
    filter,
    onSetBreakdown,
    onApplyFilter,
    onClearFilter,
    canApplyToAll,
    onApplyToAll
}) => {
    const [groupOpen, setGroupOpen] = useState(false);
    const [filterOpen, setFilterOpen] = useState(false);

    const filterGroups = dimensions.map((d) => ({ value: d, label: DIMENSION_LABELS[d] }));

    // Warm every filterable dimension's first page when the menu opens, so each value pane shows instantly.
    const prefetchValues = useApiPrefetchBillingUsageTopDimensionValues(env, metric, timeframe);

    // Loads one dimension's values for the FilterSelect value pane (mounted per open group, so it
    // fetches lazily; the prefetch above keeps the first page instant). `search` (debounced by the
    // pane) hits ClickHouse so any value is reachable, and pages load on scroll. Closed dimensions
    // like environment_id aren't searchable, so they just get their small set back unfiltered.
    const useGroupData = (dimension: string, { search }: { search: string }): FilterSelectGroupData => {
        const dim = dimension as AnyBreakdownDimension;
        const query = useApiGetBillingUsageTopDimensionValues(env, metric, dim, timeframe, search, { enabled: true });
        const options = (query.data?.pages.flatMap((p) => p.data.values) ?? []).map((v) => ({ value: v.id, label: formatDimensionValue(dim, v.label) }));
        return {
            options,
            isLoading: query.isLoading,
            isError: query.isError,
            isFetching: query.isFetching,
            hasNextPage: query.hasNextPage,
            isFetchingNextPage: query.isFetchingNextPage,
            fetchNextPage: query.fetchNextPage
        };
    };

    // Active-filter chip label. `top-dimension-values` is the id→label source for environment_id
    // (e.g. 105 → "dev"); slug dims have id === label. `null` means the env name hasn't resolved
    // yet — render a skeleton rather than flash the raw id, then show the name (or the id, if it's
    // outside the fetched set).
    const filterNeedsLabel = filter?.dimension === 'environment_id';
    const filterLabelQuery = useApiGetBillingUsageTopDimensionValues(env, metric, filterNeedsLabel ? 'environment_id' : null, timeframe, '', {
        enabled: filterNeedsLabel
    });
    const filterLabelValues = filterLabelQuery.data?.pages.flatMap((p) => p.data.values) ?? null;
    // Non-env dimensions already store a readable value. For environment_id, resolve the id to the
    // env name once loaded; `null` means it's still loading, which renders a skeleton in the chip.
    let filterLabel: string | null = filter ? filter.value : '';
    if (filter && filterNeedsLabel) {
        filterLabel = filterLabelValues ? (filterLabelValues.find((v) => v.id === filter.value)?.label ?? filter.value) : null;
    }

    const filterTriggerButton = (
        <button type="button" className={cn(TRIGGER, filter ? 'pr-9' : 'pr-6')} title="Filter this metric to a single value">
            <ListFilter className="size-3.5 shrink-0 text-text-muted" />
            {filter ? (
                <>
                    <span className="text-text-muted">{DIMENSION_LABELS[filter.dimension]}:</span>
                    {filterLabel === null ? (
                        <Skeleton className="h-3.5 w-12 rounded" />
                    ) : (
                        <span className="max-w-[160px] truncate text-text-strong">{formatDimensionValue(filter.dimension, filterLabel)}</span>
                    )}
                </>
            ) : (
                <span>Filter</span>
            )}
        </button>
    );

    return (
        <div className="flex items-center gap-2">
            {canApplyToAll && (
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            type="button"
                            onClick={onApplyToAll}
                            aria-label="Apply to all"
                            className="flex h-7 items-center justify-center px-1 text-text-muted hover:text-text-strong"
                        >
                            <SquareStack className="size-4" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent>Apply this group and filter to every applicable metric</TooltipContent>
                </Tooltip>
            )}

            <SlotTrigger onClear={breakdownDimension ? () => onSetBreakdown(null) : undefined} clearLabel="Remove grouping">
                <DropdownMenu open={groupOpen} onOpenChange={setGroupOpen}>
                    <DropdownMenuTrigger asChild>
                        <button type="button" className={cn(TRIGGER, breakdownDimension ? 'pr-9' : 'pr-6')} title="Group this metric by a dimension">
                            <Layers className="size-3.5 shrink-0 text-text-muted" />
                            {breakdownDimension ? (
                                <>
                                    <span className="text-text-muted">Group:</span>
                                    <span className="max-w-[140px] truncate text-text-strong">{DIMENSION_LABELS[breakdownDimension]}</span>
                                </>
                            ) : (
                                <span>Group</span>
                            )}
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                        {dimensions.map((d) => (
                            <DropdownMenuItem key={d} onSelect={() => onSetBreakdown(d)} className={DIM_ITEM}>
                                <span className="truncate">{DIMENSION_LABELS[d]}</span>
                                {d === breakdownDimension && <Check className="ml-auto size-3.5 shrink-0 text-text-muted" />}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            </SlotTrigger>

            <SlotTrigger onClear={filter ? onClearFilter : undefined} clearLabel="Clear filter">
                <FilterSelect
                    trigger={filterTriggerButton}
                    open={filterOpen}
                    onOpenChange={(next) => {
                        setFilterOpen(next);
                        if (next) prefetchValues(dimensions);
                    }}
                    groups={filterGroups}
                    useGroupData={useGroupData}
                    selectedValueFor={(g) => (filter?.dimension === g ? filter.value : null)}
                    onSelect={(g, value) => onApplyFilter(g as AnyBreakdownDimension, value)}
                    searchable={(g) => isSearchableDimension(g as AnyBreakdownDimension)}
                />
            </SlotTrigger>
        </div>
    );
};
