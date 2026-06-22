import { Check, ChevronLeft, ChevronsUpDown, Layers, ListFilter, SquareStack, X } from 'lucide-react';
import { useState } from 'react';

import { InputGroup, InputGroupInput } from '@/components/ui/InputGroup';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';
import { Spinner } from '@/components/ui/Spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/Tooltip';
import { useApiGetBillingUsageTopDimensionValues, useApiPrefetchBillingUsageTopDimensionValues } from '@/hooks/usePlan';
import { DEFAULT_TOP_N, DIMENSION_LABELS, formatDimensionValue } from '../usageBreakdown';

import type { AnyBreakdownDimension } from '../usageBreakdown';
import type { UsageMetric } from '@nangohq/types';

// Mirror the Select component's trigger / content / item styling so these read as the
// same kind of dropdown as the rest of the dashboard.
const TRIGGER =
    'flex h-7 w-fit items-center gap-1.5 rounded border border-border-muted bg-surface-overlay px-1.5 py-0.5 text-s text-text-secondary whitespace-nowrap hover:bg-state-hover focus-default';
const CONTENT = 'z-50 flex flex-col overflow-y-auto rounded border border-border-muted bg-surface-overlay p-1 text-text-secondary';
const ITEM =
    'flex h-7 w-full cursor-pointer items-center justify-between gap-2 rounded px-2 py-1 text-body-medium-regular text-text-secondary hover:bg-state-hover hover:text-text-strong';

/** Inline ✕ inside a trigger that clears the slot without opening the popover. */
const ClearButton: React.FC<{ onClear: () => void; label: string }> = ({ onClear, label }) => (
    <span
        role="button"
        tabIndex={0}
        aria-label={label}
        title={label}
        className="flex items-center text-text-muted hover:text-text-strong"
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
 * Two explicit, independent slots for a usage panel: "Group" (one breakdown dimension)
 * and "Filter" (one dimension = value). Each is always explicit about its own
 * dimension; the dimension used by one is excluded from the other so they can never
 * collide (the backend rejects same-dim filter+breakdown). Clearing a slot is the ✕ on
 * its trigger. "Apply to all" copies both slots to every metric that supports them.
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
    // The filter dimension being configured (null = the dimension list). Seed it from the active
    // filter so reopening an existing filter renders its value list immediately (no dimension-list flash).
    const [pickedDim, setPickedDim] = useState<AnyBreakdownDimension | null>(filter?.dimension ?? null);
    const [search, setSearch] = useState('');

    // Each slot's dimension is excluded from the other's options.
    const groupOptions = dimensions.filter((d) => d !== filter?.dimension);
    const filterDimOptions = dimensions.filter((d) => d !== breakdownDimension);

    const topQuery = useApiGetBillingUsageTopDimensionValues(env, metric, pickedDim, timeframe, DEFAULT_TOP_N, { enabled: filterOpen && pickedDim !== null });
    // Warm every filterable dimension's values when the popover opens, so picking one is instant.
    const prefetchValues = useApiPrefetchBillingUsageTopDimensionValues(env, metric, timeframe, DEFAULT_TOP_N);
    const values = topQuery.data?.data.values ?? [];
    // Active-filter chip label. `top-dimension-values` is the id→label source
    // (e.g. environment_id 105 → "dev"); only environment_id needs it — slug dims
    // have id === label. Falls back to the raw value if it's outside the top-N.
    const filterNeedsLabel = filter?.dimension === 'environment_id';
    const filterLabelQuery = useApiGetBillingUsageTopDimensionValues(env, metric, filterNeedsLabel ? 'environment_id' : null, timeframe, DEFAULT_TOP_N, {
        enabled: filterNeedsLabel
    });
    const filterLabel = !filter
        ? ''
        : filterNeedsLabel
          ? (filterLabelQuery.data?.data.values.find((v) => v.id === filter.value)?.label ?? filter.value)
          : filter.value;
    const trimmed = search.trim();
    const q = trimmed.toLowerCase();
    const matches = q ? values.filter((v) => v.label.toLowerCase().includes(q) || v.id.toLowerCase().includes(q)) : values;
    const showCreate = trimmed.length > 0 && !values.some((v) => v.id === trimmed);

    const closeFilter = () => {
        setFilterOpen(false);
        setPickedDim(null);
        setSearch('');
    };
    const applyFilterValue = (value: string) => {
        if (pickedDim) onApplyFilter(pickedDim, value);
        closeFilter();
    };

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
            <Popover open={groupOpen} onOpenChange={setGroupOpen}>
                <PopoverTrigger asChild>
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
                </PopoverTrigger>
                <PopoverContent align="end" className={`w-52 ${CONTENT}`}>
                    {groupOptions.map((d) => (
                        <button
                            key={d}
                            type="button"
                            onClick={() => {
                                onSetBreakdown(d);
                                setGroupOpen(false);
                            }}
                            className={ITEM}
                        >
                            <span className="truncate">{DIMENSION_LABELS[d]}</span>
                            {d === breakdownDimension && <Check className="size-3.5 shrink-0 text-text-muted" />}
                        </button>
                    ))}
                </PopoverContent>
            </Popover>

            <Popover
                open={filterOpen}
                onOpenChange={(next) => {
                    setFilterOpen(next);
                    setSearch('');
                    // Reset to the active filter's dimension (its value list) on both open and close, so
                    // reopening an existing filter never flashes the dimension list. Adding (no filter)
                    // starts at the dimension list.
                    setPickedDim(filter?.dimension ?? null);
                    // Warm every filterable dimension's values up front, so picking one shows results instantly.
                    if (next) prefetchValues(filterDimOptions);
                }}
            >
                <PopoverTrigger asChild>
                    <button type="button" className={TRIGGER} title="Filter this metric to a single value">
                        <ListFilter className="size-3.5 shrink-0 text-text-muted" />
                        {filter ? (
                            <>
                                <span className="text-text-muted">{DIMENSION_LABELS[filter.dimension]}:</span>
                                <span className="max-w-[160px] truncate text-text-strong">{formatDimensionValue(filter.dimension, filterLabel)}</span>
                                <ClearButton onClear={onClearFilter} label="Clear filter" />
                            </>
                        ) : (
                            <span>Filter</span>
                        )}
                        <ChevronsUpDown className="size-3 shrink-0 text-text-muted" />
                    </button>
                </PopoverTrigger>
                <PopoverContent align="end" className={`w-72 ${CONTENT}`}>
                    {pickedDim === null ? (
                        filterDimOptions.map((d) => (
                            <button
                                key={d}
                                type="button"
                                onClick={() => {
                                    setPickedDim(d);
                                    setSearch('');
                                }}
                                className={ITEM}
                            >
                                <span className="truncate">{DIMENSION_LABELS[d]}</span>
                                {d === filter?.dimension && <Check className="size-3.5 shrink-0 text-text-muted" />}
                            </button>
                        ))
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={() => {
                                    setPickedDim(null);
                                    setSearch('');
                                }}
                                className="flex w-full items-center gap-1 rounded px-2 py-1 text-left text-text-muted hover:text-text-strong"
                            >
                                <ChevronLeft className="size-3.5 shrink-0" />
                                <span className="truncate">{DIMENSION_LABELS[pickedDim]}</span>
                            </button>
                            <InputGroup className="h-auto rounded border-[0.5px] border-border-muted px-2.5 py-1.5">
                                <InputGroupInput
                                    autoFocus
                                    type="text"
                                    placeholder="Search…"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            // Enter commits the first visible match, otherwise the typed value.
                                            if (matches.length > 0) applyFilterValue(matches[0].id);
                                            else if (trimmed) applyFilterValue(trimmed);
                                        }
                                    }}
                                    className="h-auto p-0 text-body-medium-regular"
                                />
                            </InputGroup>

                            <div className="mt-1 max-h-52 overflow-y-auto" role="listbox">
                                {topQuery.isLoading ? (
                                    <div className="flex justify-center py-3">
                                        <Spinner />
                                    </div>
                                ) : (
                                    <>
                                        {matches.map((v) => (
                                            <button key={v.id} type="button" role="option" onClick={() => applyFilterValue(v.id)} className={ITEM}>
                                                <span className="truncate">{formatDimensionValue(pickedDim, v.label)}</span>
                                                {filter?.value === v.id && <Check className="size-3.5 shrink-0 text-text-muted" />}
                                            </button>
                                        ))}
                                        {showCreate && (
                                            <button type="button" onClick={() => applyFilterValue(trimmed)} className={ITEM}>
                                                <span className="flex min-w-0 items-center gap-1">
                                                    <span className="shrink-0 text-text-muted">Filter to</span>
                                                    <span className="truncate text-text-strong">&quot;{trimmed}&quot;</span>
                                                </span>
                                            </button>
                                        )}
                                        {matches.length === 0 && !showCreate && (
                                            <div className="px-2 py-3 text-center text-text-muted text-body-small-regular">
                                                {topQuery.isError ? 'Failed to load values' : 'No values'}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </>
                    )}
                </PopoverContent>
            </Popover>
        </div>
    );
};
