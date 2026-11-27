import { Menu } from '@base-ui/react';
import { ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Button, InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupKbd, LinkButton, StatusIndicator } from '@nangohq/design-system';

import { PeriodSelector } from '@/components/patterns/PeriodSelector';
import { FilterMenu } from '@/components/ui/FilterMenu';
import { FilterTrigger } from '@/components/ui/FilterTrigger';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useSearchQueryState } from '@/hooks/useSearchQueryState';
import { useSearchFilters } from '../../../hooks/useLogs';
import { useStore } from '../../../store';
import { track } from '../../../utils/analytics';
import { last24hPreset, logsPresets } from '../../../utils/logs';
import { statusOptions, typesOptions } from '../constants';
import { useLogsFilters } from '../filters';
import { groupState, toggleGroup, toggleSubtype, typeLabel } from '../typeFilter';

import type { Period } from '../../../utils/dates';
import type { LogsState, LogsType } from '../constants';
import type { FilterCheckState, FilterMenuOption } from '@/components/ui/FilterMenu';
import type { StatusIndicatorProps } from '@nangohq/design-system';
import type { AnalyticsEventProperties, SearchFiltersCategory } from '@nangohq/types';

type LogsFilter = AnalyticsEventProperties<'logs:filter_update'>['filter'];
type FacetKey = 'status' | 'type' | 'integration' | 'connection' | 'function' | 'agentSession';

const MAX_REMOTE_VALUES = 20;

const statusTones: Record<LogsState, StatusIndicatorProps['tone']> = {
    success: 'success',
    failed: 'danger',
    timeout: 'warning',
    running: 'info',
    waiting: 'muted',
    cancelled: 'muted'
};

const statusMenuOptions: FilterMenuOption[] = statusOptions.map((option) => ({
    value: option.value,
    label: option.label,
    icon: <StatusIndicator tone={statusTones[option.value]} />
}));

const typeMenuOptions: FilterMenuOption[] = typesOptions.map((option) => ({ value: option.value, label: option.label, children: option.children }));

const toggled = <T extends string>(selected: T[], value: T): T[] => (selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);

interface FacetMenuProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    anchor?: React.RefObject<HTMLElement | null>;
}

const RemoteFacet: React.FC<
    FacetMenuProps & {
        label: string;
        category: SearchFiltersCategory;
        selected: string[];
        onChange: (selected: string[]) => void;
        alwaysShowTrigger: boolean;
    }
> = ({ label, category, selected, onChange, open, onOpenChange, anchor, alwaysShowTrigger }) => {
    const env = useStore((state) => state.env);
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebouncedValue(search.trim(), 250);
    const { data, loading } = useSearchFilters(open, env, { category, search: debouncedSearch || undefined });

    // Selected values stay listed when the server's page or the search leaves them out, so they can be unticked.
    const options = useMemo(() => {
        const keys = data?.data.map((item) => item.key) ?? [];
        const missing = debouncedSearch ? [] : selected.filter((value) => !keys.includes(value));
        return [...missing, ...keys].map((key) => ({ value: key, label: key, mono: category !== 'integration' }));
    }, [data, selected, debouncedSearch, category]);

    const showTrigger = alwaysShowTrigger || selected.length > 0;

    return (
        <FilterMenu
            trigger={showTrigger ? <FilterTrigger label={label} count={selected.length} selectedLabel={selected[0]} /> : undefined}
            anchor={anchor}
            open={open}
            onOpenChange={onOpenChange}
            options={options}
            selected={selected}
            onToggle={(value) => onChange(toggled(selected, value))}
            onClear={() => onChange([])}
            searchable
            searchPlaceholder={`Search ${label.toLowerCase()}s…`}
            onSearchChange={setSearch}
            loading={loading}
            max={MAX_REMOTE_VALUES}
        />
    );
};

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
        <div className="w-64">
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
    const [openFacet, setOpenFacet] = useState<FacetKey | null>(null);
    const moreRef = useRef<HTMLButtonElement>(null);

    const facetProps = (key: FacetKey): FacetMenuProps => ({
        open: openFacet === key,
        onOpenChange: (open) => setOpenFacet(open ? key : null),
        anchor: moreRef
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

    const secondary: { key: FacetKey; label: string; selected: string[] }[] = [
        { key: 'connection', label: 'Connection', selected: filters.connections },
        { key: 'function', label: 'Function', selected: filters.syncs },
        { key: 'agentSession', label: 'Agent session', selected: filters.agentSessions }
    ];
    const unsetSecondary = secondary.filter((facet) => facet.selected.length === 0);

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

    return (
        <div className="flex flex-wrap items-center gap-1.5">
            <LogsSearch />
            <FilterMenu
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
            <RemoteFacet
                label="Integration"
                category="integration"
                selected={filters.integrations}
                onChange={tracked('integration', filters.setIntegrations)}
                alwaysShowTrigger
                {...facetProps('integration')}
            />
            <RemoteFacet
                label="Connection"
                category="connection"
                selected={filters.connections}
                onChange={tracked('connection', filters.setConnections)}
                alwaysShowTrigger={false}
                {...facetProps('connection')}
            />
            <RemoteFacet
                label="Function"
                category="syncConfig"
                selected={filters.syncs}
                onChange={tracked('script', filters.setSyncs)}
                alwaysShowTrigger={false}
                {...facetProps('function')}
            />
            <RemoteFacet
                label="Agent session"
                category="agentSession"
                selected={filters.agentSessions}
                onChange={tracked('agent_session', filters.setAgentSessions)}
                alwaysShowTrigger={false}
                {...facetProps('agentSession')}
            />
            {unsetSecondary.length > 0 && (
                <Menu.Root>
                    <Menu.Trigger
                        ref={moreRef}
                        render={
                            <Button variant="outline" size="sm">
                                More filters
                                <ChevronDown className="size-3 text-icon-secondary" />
                            </Button>
                        }
                    />
                    <Menu.Portal>
                        <Menu.Positioner side="bottom" align="start" sideOffset={4} className="isolate z-50">
                            <Menu.Popup className="flex min-w-48 flex-col rounded-ds-sm border-ds-1 border-border-default bg-surface-overlay p-1 shadow-md outline-none">
                                {unsetSecondary.map((facet) => (
                                    <Menu.Item
                                        key={facet.key}
                                        onClick={() => setOpenFacet(facet.key)}
                                        className="flex h-7 cursor-pointer items-center gap-2 rounded-ds-xs px-2 text-ds-sm text-text-secondary outline-none select-none data-highlighted:bg-state-hover data-highlighted:text-text-strong"
                                    >
                                        <span className="flex-1">{facet.label}</span>
                                        <ChevronRight className="size-3 text-icon-secondary" />
                                    </Menu.Item>
                                ))}
                            </Menu.Popup>
                        </Menu.Positioner>
                    </Menu.Portal>
                </Menu.Root>
            )}
            <div>
                <PeriodSelector
                    size="sm"
                    isLive={filters.isLive && !search}
                    period={{ from: filters.period[0], to: filters.period[1] }}
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
            <div className="ml-auto flex items-center whitespace-nowrap type-text-regular-xs text-text-secondary tabular-nums">{count}</div>
        </div>
    );
};
