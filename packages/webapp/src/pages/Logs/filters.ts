import { parseAsArrayOf, parseAsBoolean, parseAsString, parseAsStringEnum, parseAsStringLiteral, parseAsTimestamp, useQueryState } from 'nuqs';

import { last24hPreset } from '../../utils/logs';
import { statusOptions, typesList } from './constants';

const parseLive = parseAsBoolean.withDefault(true).withOptions({ history: 'push' });
const parseStates = parseAsArrayOf(parseAsStringLiteral(statusOptions.map((opt) => opt.value)), ',')
    .withDefault(['all'])
    .withOptions({ history: 'push' });
const parseTypes = parseAsArrayOf(parseAsStringEnum(typesList), ',').withDefault(['all']).withOptions({ history: 'push' });
const parseIds = parseAsArrayOf(parseAsString, ',').withDefault(['all']).withOptions({ history: 'push' });
const parsePeriod = parseAsArrayOf(parseAsTimestamp, ',').withOptions({ history: 'push' }).withDefault(Object.values(last24hPreset.toPeriod()!));

export function useLogsFilters() {
    const [isLive, setLive] = useQueryState('live', parseLive);
    const [states, setStates] = useQueryState('states', parseStates);
    const [types, setTypes] = useQueryState('types', parseTypes);
    const [integrations, setIntegrations] = useQueryState('integrations', parseIds);
    const [connections, setConnections] = useQueryState('connections', parseIds);
    const [syncs, setSyncs] = useQueryState('syncs', parseIds);
    const [agentSessions, setAgentSessions] = useQueryState('agentSessions', parseIds);
    const [period, setPeriod] = useQueryState('period', parsePeriod);

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
