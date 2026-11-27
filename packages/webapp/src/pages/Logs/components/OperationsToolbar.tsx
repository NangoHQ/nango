import { Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button, InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupKbd, LinkButton, StatusIndicator } from '@nangohq/design-system';

import { PeriodSelector } from '@/components/patterns/PeriodSelector';
import { FilterMenu } from '@/components/ui/FilterMenu';
import { FilterTrigger } from '@/components/ui/FilterTrigger';
import { useSearchQueryState } from '@/hooks/useSearchQueryState';
import { usePrefetchSearchFilters } from '../../../hooks/useLogs';
import { useStore } from '../../../store';
import { track } from '../../../utils/analytics';
import { last24hPreset, logsPresets, slidePeriod } from '../../../utils/logs';
import { statusOptions, typesOptions } from '../constants';
import { useLogsFilters } from '../filters';
import { groupState, toggleGroup, toggleSubtype, typeLabel } from '../typeFilter';
import { MoreFilters } from './MoreFilters';
import { OperationStatus } from './OperationStatus';
import { RemoteFilterMenu, toggled } from './RemoteFilterMenu';

import type { Period } from '../../../utils/dates';
import type { LogsState, LogsType } from '../constants';
import type { MoreFilter } from './MoreFilters';
import type { FilterCheckState, FilterMenuOption } from '@/components/ui/FilterMenu';
import type { AnalyticsEventProperties } from '@nangohq/types';

type LogsFilter = AnalyticsEventProperties<'logs:filter_update'>['filter'];
type FacetKey = 'status' | 'type' | 'integration';

const statusMenuOptions: FilterMenuOption[] = statusOptions.map((option) => ({
    value: option.value,
    label: option.label,
    icon: <OperationStatus state={option.value} withLabel={false} animated={false} />
}));

const typeMenuOptions: FilterMenuOption[] = typesOptions.map((option) => ({ value: option.value, label: option.label, children: option.children }));

const LogsSearch: React.FC = () => {
    const [search, setSearch] = useSearchQueryState();
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) {
                return;
            }
            const target = e.target as HTMLElement | null;
            if (target?.closest('input, textarea, select, [contenteditable="true"]')) {
                return;
            }
            e.preventDefault();
            inputRef.current?.focus();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, []);

    return (
        <div className="max-w-64 min-w-40 grow basis-40">
            <InputGroup size="sm">
                <InputGroupAddon>
                    <Search />
                </InputGroupAddon>
                <InputGroupInput
                    ref={inputRef}
                    size="sm"
                    placeholder="Search log messages…"
                    aria-label="Search log messages"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                            e.currentTarget.blur();
                        }
                    }}
                />
                <InputGroupAddon align="inline-end">
                    {search ? (
                        <InputGroupButton label="Clear search" variant="ghost" size="icon-xs" onClick={() => setSearch('')}>
                            <X />
                        </InputGroupButton>
                    ) : (
                        <InputGroupKbd>/</InputGroupKbd>
                    )}
                </InputGroupAddon>
            </InputGroup>
        </div>
    );
};

export const OperationsToolbar: React.FC<{ count: React.ReactNode }> = ({ count }) => {
    const [search, setSearch] = useSearchQueryState();
    const filters = useLogsFilters();
    const prefetch = usePrefetchSearchFilters(useStore((state) => state.env));
    const [openFacet, setOpenFacet] = useState<FacetKey | null>(null);

    const facetProps = (key: FacetKey) => ({
        open: openFacet === key,
        onOpenChange: (open: boolean) => setOpenFacet(open ? key : null)
    });

    const tracked =
        <T,>(filter: LogsFilter, set: (value: T[]) => unknown) =>
        (value: T[]) => {
            track('logs:filter_update', { filter });
            void set(value);
        };
    const setStates = tracked<LogsState>('status', filters.setStates);
    const setTypes = tracked<LogsType>('type', filters.setTypes);

    const typeCheckState = (value: string): FilterCheckState => {
        const group = typesOptions.find((option) => option.value === value);
        if (group) {
            const state = groupState(filters.types, group);
            if (state === 'all') return 'checked';
            return state === 'partial' ? 'indeterminate' : 'unchecked';
        }
        const parent = typesOptions.find((option) => option.children?.some((child) => child.value === value));
        return filters.types.includes(value as LogsType) || (parent && filters.types.includes(parent.value)) ? 'checked' : 'unchecked';
    };

    const toggleType = (value: string) => {
        const group = typesOptions.find((option) => option.value === value);
        if (group) {
            setTypes(toggleGroup(filters.types, group));
            return;
        }
        const parent = typesOptions.find((option) => option.children?.some((child) => child.value === value));
        setTypes(parent ? toggleSubtype(filters.types, parent, value as LogsType) : toggled(filters.types, value as LogsType));
    };

    const moreFilters: MoreFilter[] = [
        {
            key: 'connection',
            label: 'Connection',
            category: 'connection',
            selected: filters.connections,
            onChange: tracked('connection', filters.setConnections)
        },
        { key: 'function', label: 'Function', category: 'syncConfig', selected: filters.syncs, onChange: tracked('script', filters.setSyncs) },
        {
            key: 'agentSession',
            label: 'Agent session',
            category: 'agentSession',
            selected: filters.agentSessions,
            onChange: tracked('agent_session', filters.setAgentSessions)
        }
    ];

    const anyFilter =
        Boolean(search) ||
        [filters.states, filters.types, filters.integrations, filters.connections, filters.syncs, filters.agentSessions].some((value) => value.length > 0);

    const clearAll = () => {
        setSearch('');
        void filters.setStates([]);
        void filters.setTypes([]);
        void filters.setIntegrations([]);
        void filters.setConnections([]);
        void filters.setSyncs([]);
        void filters.setAgentSessions([]);
    };

    const onPeriodChange = (period: Period | null, live: boolean) => {
        track('logs:filter_update', { filter: 'period' });
        void filters.setPeriod(period ? [period.from, period.to ?? new Date()] : []);
        void filters.setLive(live);
    };

    // Live mode slides the stored window. Unslid, it stops matching "Last 24 hours" a minute after it was set.
    const displayedPeriod = filters.isLive
        ? slidePeriod({ from: filters.period[0], to: filters.period[1] })
        : { from: filters.period[0], to: filters.period[1] };

    const toggleLive = () => {
        track('logs:filter_update', { filter: 'period' });
        if (filters.isLive) {
            const frozen = slidePeriod({ from: filters.period[0], to: filters.period[1] });
            void filters.setPeriod([frozen.from, frozen.to ?? new Date()]);
        }
        void filters.setLive(!filters.isLive);
    };

    return (
        <div className="flex flex-wrap items-center gap-1.5">
            <LogsSearch />
            <FilterMenu
                label="Status"
                trigger={
                    <FilterTrigger
                        label="Status"
                        count={filters.states.length}
                        selectedLabel={statusOptions.find((option) => option.value === filters.states[0])?.label}
                    />
                }
                {...facetProps('status')}
                options={statusMenuOptions}
                selected={filters.states}
                onToggle={(value) => setStates(toggled(filters.states, value as LogsState))}
                onClear={() => setStates([])}
            />
            <FilterMenu
                label="Type"
                trigger={
                    <FilterTrigger label="Type" count={filters.types.length} selectedLabel={filters.types[0] && typeLabel(filters.types[0], typesOptions)} />
                }
                {...facetProps('type')}
                options={typeMenuOptions}
                selected={filters.types}
                checkState={typeCheckState}
                onToggle={toggleType}
                onClear={() => setTypes([])}
            />
            <RemoteFilterMenu
                label="Integration"
                category="integration"
                selected={filters.integrations}
                onChange={tracked('integration', filters.setIntegrations)}
                trigger={
                    <FilterTrigger
                        label="Integration"
                        count={filters.integrations.length}
                        selectedLabel={filters.integrations[0]}
                        onPointerEnter={() => prefetch('integration')}
                        onFocus={() => prefetch('integration')}
                    />
                }
                {...facetProps('integration')}
            />
            <MoreFilters filters={moreFilters} />
            <div>
                <PeriodSelector
                    density="compact"
                    isLive={false}
                    period={displayedPeriod}
                    onChange={onPeriodChange}
                    presets={logsPresets}
                    defaultPreset={last24hPreset}
                />
            </div>
            {anyFilter && (
                <div className="px-1">
                    <LinkButton tone="accent" size="sm" onClick={clearAll}>
                        Clear filters
                    </LinkButton>
                </div>
            )}
            <div className="ml-auto flex items-center gap-2 whitespace-nowrap type-text-regular-xs text-text-secondary tabular-nums">
                {!search && (
                    <>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={toggleLive}
                            title={
                                filters.isLive
                                    ? 'Showing new operations as they arrive. Click to pause.'
                                    : 'Paused. Click to show new operations as they arrive.'
                            }
                        >
                            <StatusIndicator tone={filters.isLive ? 'success' : 'muted'} pulse={filters.isLive}>
                                {filters.isLive ? 'Live' : 'Paused'}
                            </StatusIndicator>
                        </Button>
                    </>
                )}
                {count}
            </div>
        </div>
    );
};
