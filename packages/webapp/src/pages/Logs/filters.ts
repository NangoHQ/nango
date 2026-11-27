import { parseAsArrayOf, parseAsBoolean, parseAsString, parseAsStringEnum, parseAsStringLiteral, parseAsTimestamp, useQueryState } from 'nuqs';
import { useMemo } from 'react';

import { last24hPreset } from '../../utils/logs';
import { statusValues, typesList } from './constants';

import type { LogsState, LogsType } from './constants';

const parseLive = parseAsBoolean.withDefault(true).withOptions({ history: 'push' });
const parseStates = parseAsArrayOf(parseAsStringLiteral<LogsState | 'all'>(['all', ...statusValues]), ',').withDefault([]);
const parseTypes = parseAsArrayOf(parseAsStringEnum<LogsType | 'all'>(['all', ...typesList]), ',').withDefault([]);
const parseIds = parseAsArrayOf(parseAsString, ',').withDefault([]);
const defaultPeriod = last24hPreset.toPeriod()!;
const parsePeriod = parseAsArrayOf(parseAsTimestamp, ',')
    .withOptions({ history: 'push' })
    .withDefault([defaultPeriod.from, defaultPeriod.to ?? new Date()]);

/** Links written before empty meant "all" carry an explicit `all`, sometimes next to real values. */
export function withoutAll<T extends string>(values: (T | 'all')[]): T[] {
    return values.filter((value): value is T => value !== 'all');
}

// Types the menu has no row for. Links and the panel's "show only this type" still write them.
const typeAliases: Partial<Record<LogsType, LogsType>> = {
    action: 'tool',
    'action:run': 'tool',
    'tool:call': 'tool',
    'function:invoke': 'function'
};

export function normalizeTypes(values: (LogsType | 'all')[]): LogsType[] {
    return [...new Set(withoutAll(values).map((value) => typeAliases[value] ?? value))];
}

export function useLogsFilters() {
    const [isLive, setLive] = useQueryState('live', parseLive);
    const [rawStates, setStates] = useQueryState('states', parseStates);
    const [rawTypes, setTypes] = useQueryState('types', parseTypes);
    const [rawIntegrations, setIntegrations] = useQueryState('integrations', parseIds);
    const [rawConnections, setConnections] = useQueryState('connections', parseIds);
    const [rawSyncs, setSyncs] = useQueryState('syncs', parseIds);
    const [rawAgentSessions, setAgentSessions] = useQueryState('agentSessions', parseIds);
    const [period, setPeriod] = useQueryState('period', parsePeriod);

    const states = useMemo(() => withoutAll<LogsState>(rawStates), [rawStates]);
    const types = useMemo(() => normalizeTypes(rawTypes), [rawTypes]);
    const integrations = useMemo(() => withoutAll(rawIntegrations), [rawIntegrations]);
    const connections = useMemo(() => withoutAll(rawConnections), [rawConnections]);
    const syncs = useMemo(() => withoutAll(rawSyncs), [rawSyncs]);
    const agentSessions = useMemo(() => withoutAll(rawAgentSessions), [rawAgentSessions]);

    return {
        isLive,
        setLive,
        states,
        setStates,
        types,
        setTypes,
        integrations,
        setIntegrations,
        connections,
        setConnections,
        syncs,
        setSyncs,
        agentSessions,
        setAgentSessions,
        period,
        setPeriod
    };
}
