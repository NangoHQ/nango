import { Search, X } from 'lucide-react';

import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@nangohq/design-system';

import { FilterMultiSelect } from '@/components/patterns/FilterMultiSelect';
import { PeriodSelector } from '@/components/patterns/PeriodSelector';
import { useSearchQueryState } from '@/hooks/useSearchQueryState';
import { track } from '../../../utils/analytics';
import { last24hPreset, logsPresets } from '../../../utils/logs';
import { statusOptions, typesOptions } from '../constants';
import { useLogsFilters } from '../filters';
import { SearchableMultiSelect } from './SearchableMultiSelect';

import type { Period } from '../../../utils/dates';
import type { AnalyticsEventProperties } from '@nangohq/types';

type LogsFilter = AnalyticsEventProperties<'logs:filter_update'>['filter'];

export const OperationsToolbar: React.FC = () => {
    const [search, setSearch] = useSearchQueryState();
    const filters = useLogsFilters();

    const onPeriodChange = (period: Period | null, live: boolean) => {
        track('logs:filter_update', { filter: 'period' });
        void filters.setPeriod(period ? [period.from, period.to ?? new Date()] : []);
        void filters.setLive(live);
    };

    const trackedFilter =
        <T,>(filter: LogsFilter, current: T[], set: (value: T[]) => unknown) =>
        (value: T[]) => {
            if (value.join(',') !== current.join(',')) {
                track('logs:filter_update', { filter });
            }
            void set(value);
        };

    return (
        <div className="flex flex-wrap gap-2 justify-between">
            <div className="flex-1 min-w-60">
                <InputGroup>
                    <InputGroupAddon>
                        <Search />
                    </InputGroupAddon>
                    <InputGroupInput placeholder="Search logs..." onChange={(e) => setSearch(e.target.value)} value={search} />
                    {search && (
                        <InputGroupAddon align="inline-end">
                            <InputGroupButton label="Clear search" variant={'ghost'} size={'icon-xs'} onClick={() => setSearch('')}>
                                <X />
                            </InputGroupButton>
                        </InputGroupAddon>
                    )}
                </InputGroup>
            </div>
            <div className="flex flex-wrap gap-2">
                <FilterMultiSelect
                    label="Status"
                    options={statusOptions}
                    selected={filters.states}
                    defaultSelect={['all']}
                    onChange={trackedFilter('status', filters.states, filters.setStates)}
                />
                <FilterMultiSelect
                    label="Type"
                    options={typesOptions}
                    selected={filters.types}
                    defaultSelect={['all']}
                    onChange={trackedFilter('type', filters.types, filters.setTypes)}
                    width="w-80"
                />
                <SearchableMultiSelect
                    label="Integration"
                    selected={filters.integrations}
                    category={'integration'}
                    onChange={trackedFilter('integration', filters.integrations, filters.setIntegrations)}
                    max={20}
                />
                <SearchableMultiSelect
                    label="Connection"
                    selected={filters.connections}
                    category={'connection'}
                    onChange={trackedFilter('connection', filters.connections, filters.setConnections)}
                    max={20}
                />
                <SearchableMultiSelect
                    label="Script"
                    selected={filters.syncs}
                    category={'syncConfig'}
                    onChange={trackedFilter('script', filters.syncs, filters.setSyncs)}
                    max={20}
                />
                <SearchableMultiSelect
                    label="Agent session"
                    selected={filters.agentSessions}
                    category={'agentSession'}
                    onChange={trackedFilter('agent_session', filters.agentSessions, filters.setAgentSessions)}
                    max={20}
                />

                <PeriodSelector
                    isLive={filters.isLive && !search}
                    period={{ from: filters.period[0], to: filters.period[1] }}
                    onChange={onPeriodChange}
                    presets={logsPresets}
                    defaultPreset={last24hPreset}
                />
            </div>
        </div>
    );
};
