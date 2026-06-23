import { Check, ChevronsUpDown, Layers, ListFilter, SquareStack, X } from 'lucide-react';
import { useState } from 'react';

import { FilterSelect } from '@/components/patterns/FilterSelect';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/DropdownMenu';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/Tooltip';
import { useApiGetBillingUsageTopDimensionValues, useApiPrefetchBillingUsageTopDimensionValues } from '@/hooks/usePlan';
import { DEFAULT_TOP_N, DIMENSION_LABELS, formatDimensionValue } from '../usageBreakdown';

import type { AnyBreakdownDimension } from '../usageBreakdown';
import type { FilterSelectGroupData } from '@/components/patterns/FilterSelect';
import type { UsageMetric } from '@nangohq/types';

// Mirror the Select component's trigger styling so these read as the same kind of dropdown
// as the rest of the dashboard.
const TRIGGER =
    'flex h-7 w-fit items-center gap-1.5 rounded border border-border-muted bg-surface-overlay px-1.5 py-0.5 text-s text-text-secondary whitespace-nowrap hover:bg-state-hover focus-default';
// A Group dimension row: even height/spacing so the menu reads cleanly.
const DIM_ITEM = 'h-7 gap-2 text-body-medium-regular text-text-secondary';

/** Inline ✕ inside a trigger that clears the slot without opening the menu. */
const ClearButton: React.FC<{ onClear: () => void; label: string }> = ({ onClear, label }) => (
    <span
        role="button"
        tabIndex={0}
        aria-label={label}
        title={label}
        className="flex items-center text-text-muted hover:text-text-strong"
        // The menu triggers (radix DropdownMenu / Base UI Popover) toggle on pointer-down, so stop
        // it here — otherwise the ✕ opens the menu instead of clearing.
        onPointerDown={(e) => {
            e.stopPropagation();
        }}
        onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onClear();
        }}
        onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
                e.preventDefault();
                onClear();
            }
        }}
    >
        <X className="size-3" />
    </span>
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
 * Two explicit, independent slots for a usage panel: "Group" (one breakdown dimension) and
 * "Filter" (one dimension = value). Group is a flat dimension list; Filter is the reusable
 * {@link FilterSelect} — a dimension list where each opens an adjacent, searchable value pane.
 * Group and filter may target the same dimension (the filter then wins and the grouping is
 * ignored for the query — see UsageChartCard), so both offer every dimension. Clearing a slot is
 * the ✕ on its trigger. "Apply to all" copies both slots to every metric that supports them.
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

    // Group and filter may target the same dimension, so both slots offer every dimension.
    const groupOptions = dimensions;
    const filterGroups = dimensions.map((d) => ({ value: d, label: DIMENSION_LABELS[d] }));

    // Warm every filterable dimension's values when the menu opens, so each value pane shows instantly.
    const prefetchValues = useApiPrefetchBillingUsageTopDimensionValues(env, metric, timeframe, DEFAULT_TOP_N);

    // Loads one dimension's top-N values for the FilterSelect's value pane. Called only from that
    // pane, which mounts when (and remounts each time) a dimension opens — so it fetches lazily,
    // and the prefetch above keeps it instant.
    const useGroupData = (dimension: string): FilterSelectGroupData => {
        const dim = dimension as AnyBreakdownDimension;
        const query = useApiGetBillingUsageTopDimensionValues(env, metric, dim, timeframe, DEFAULT_TOP_N, { enabled: true });
        const options = (query.data?.data.values ?? []).map((v) => ({ value: v.id, label: formatDimensionValue(dim, v.label) }));
        return { options, isLoading: query.isLoading, isError: query.isError };
    };

    // Active-filter chip label. `top-dimension-values` is the id→label source for environment_id
    // (e.g. 105 → "dev"); slug dims have id === label. `null` means the env name hasn't resolved
    // yet — render a skeleton rather than flash the raw id, then show the name (or the id, if it's
    // outside the fetched top-N).
    const filterNeedsLabel = filter?.dimension === 'environment_id';
    const filterLabelQuery = useApiGetBillingUsageTopDimensionValues(env, metric, filterNeedsLabel ? 'environment_id' : null, timeframe, DEFAULT_TOP_N, {
        enabled: filterNeedsLabel
    });
    const filterLabel: string | null = !filter
        ? ''
        : filterNeedsLabel
          ? filterLabelQuery.data
              ? (filterLabelQuery.data.data.values.find((v) => v.id === filter.value)?.label ?? filter.value)
              : null
          : filter.value;

    const filterTrigger = (
        <button type="button" className={TRIGGER} title="Filter this metric to a single value">
            <ListFilter className="size-3.5 shrink-0 text-text-muted" />
            {filter ? (
                <>
                    <span className="text-text-muted">{DIMENSION_LABELS[filter.dimension]}:</span>
                    {filterLabel === null ? (
                        <Skeleton className="h-3.5 w-12 rounded" />
                    ) : (
                        <span className="max-w-[160px] truncate text-text-strong">{formatDimensionValue(filter.dimension, filterLabel)}</span>
                    )}
                    <ClearButton onClear={onClearFilter} label="Clear filter" />
                </>
            ) : (
                <span>Filter</span>
            )}
            <ChevronsUpDown className="size-3 shrink-0 text-text-muted" />
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

            <DropdownMenu open={groupOpen} onOpenChange={setGroupOpen}>
                <DropdownMenuTrigger asChild>
                    <button type="button" className={TRIGGER} title="Group this metric by a dimension">
                        <Layers className="size-3.5 shrink-0 text-text-muted" />
                        {breakdownDimension ? (
                            <>
                                <span className="text-text-muted">Group:</span>
                                <span className="max-w-[140px] truncate text-text-strong">{DIMENSION_LABELS[breakdownDimension]}</span>
                                <ClearButton onClear={() => onSetBreakdown(null)} label="Remove grouping" />
                            </>
                        ) : (
                            <span>Group</span>
                        )}
                        <ChevronsUpDown className="size-3 shrink-0 text-text-muted" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                    {groupOptions.map((d) => (
                        <DropdownMenuItem key={d} onSelect={() => onSetBreakdown(d)} className={DIM_ITEM}>
                            <span className="truncate">{DIMENSION_LABELS[d]}</span>
                            {d === breakdownDimension && <Check className="ml-auto size-3.5 shrink-0 text-text-muted" />}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>

            <FilterSelect
                trigger={filterTrigger}
                open={filterOpen}
                onOpenChange={(next) => {
                    setFilterOpen(next);
                    if (next) prefetchValues(dimensions);
                }}
                groups={filterGroups}
                useGroupData={useGroupData}
                selectedValueFor={(g) => (filter?.dimension === g ? filter.value : null)}
                onSelect={(g, value) => onApplyFilter(g as AnyBreakdownDimension, value)}
                allowCreate
            />
        </div>
    );
};
