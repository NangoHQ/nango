import { ExternalLink, Plus } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDebounce } from 'react-use';

import { IntegrationLogo } from '../IntegrationLogo';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { ComboboxSelect } from '../ui/combobox';
import { useConnections } from '@/hooks/useConnections';
import { useGetIntegrationFlows, useListIntegrations } from '@/hooks/useIntegration';
import { usePlaygroundStore } from '@/store/playground';

import type { ComboboxOption } from '../ui/combobox';
import type { NangoSyncConfig } from '@nangohq/types';

interface Props {
    env: string;
    queryEnv: string;
}

export const PlaygroundSelectors: React.FC<Props> = ({ env, queryEnv }) => {
    const navigate = useNavigate();

    const playgroundIntegration = usePlaygroundStore((s) => s.integration);
    const playgroundConnection = usePlaygroundStore((s) => s.connection);
    const playgroundFunction = usePlaygroundStore((s) => s.function);
    const connectionSearch = usePlaygroundStore((s) => s.connectionSearch);
    const setPlaygroundOpen = usePlaygroundStore((s) => s.setOpen);
    const setPlaygroundIntegration = usePlaygroundStore((s) => s.setIntegration);
    const setPlaygroundConnection = usePlaygroundStore((s) => s.setConnection);
    const setPlaygroundFunction = usePlaygroundStore((s) => s.setFunction);
    const setPlaygroundResult = usePlaygroundStore((s) => s.setResult);
    const setPlaygroundInputErrors = usePlaygroundStore((s) => s.setInputErrors);
    const setPlaygroundConnectionSearch = usePlaygroundStore((s) => s.setConnectionSearch);
    const setPlaygroundPendingOperationId = usePlaygroundStore((s) => s.setPendingOperationId);
    const setPlaygroundRunning = usePlaygroundStore((s) => s.setRunning);
    const running = usePlaygroundStore((s) => s.running);

    const [debouncedConnectionSearch, setDebouncedConnectionSearch] = useState('');
    useDebounce(() => setDebouncedConnectionSearch(connectionSearch || ''), 250, [connectionSearch]);

    const { data: integrations } = useListIntegrations(queryEnv);
    const { data: flowsData } = useGetIntegrationFlows(queryEnv, playgroundIntegration || '');
    const connectionsQueryEnv = queryEnv && playgroundIntegration ? queryEnv : '';
    const connectionsQuery = useConnections({
        env: connectionsQueryEnv,
        integrationIds: playgroundIntegration ? [playgroundIntegration] : undefined,
        search: debouncedConnectionSearch || undefined
    });

    const connections = useMemo(() => {
        return connectionsQuery.data?.pages.flatMap((p) => p.data) ?? [];
    }, [connectionsQuery.data]);

    const connectionOptions = useMemo(() => {
        const opts = connections.map((c) => ({ value: c.connection_id, label: c.connection_id, filterValue: c.connection_id }));
        if (playgroundConnection && !opts.some((o) => o.value === playgroundConnection)) {
            opts.unshift({ value: playgroundConnection, label: playgroundConnection, filterValue: playgroundConnection });
        }
        return opts;
    }, [connections, playgroundConnection]);

    const allFlows: (NangoSyncConfig & { resolvedType: 'action' | 'sync' })[] = useMemo(() => {
        if (!flowsData) return [];
        return flowsData.data.flows.filter((f) => f.type === 'action' || f.type === 'sync').map((f) => ({ ...f, resolvedType: f.type as 'action' | 'sync' }));
    }, [flowsData]);

    const functionOptions = useMemo(() => {
        const opts: ComboboxOption[] = allFlows
            .filter((f) => f.enabled === true)
            .map((f) => ({
                value: f.name,
                label: f.name,
                filterValue: `${f.name} ${f.resolvedType}`,
                tag: (
                    <Badge variant="gray" size="xs" className="capitalize font-mono">
                        {f.resolvedType}
                    </Badge>
                )
            }));
        if (playgroundFunction && !opts.some((o) => o.value === playgroundFunction)) {
            opts.unshift({ value: playgroundFunction, label: playgroundFunction, filterValue: playgroundFunction });
        }
        return opts;
    }, [allFlows, playgroundFunction]);

    const integrationOptions = useMemo(() => {
        const list = integrations?.data ?? [];
        const opts: ComboboxOption[] = list.map((i) => ({
            value: i.unique_key,
            label: i.display_name || i.unique_key,
            filterValue: `${i.display_name ?? ''} ${i.unique_key ?? ''} ${i.provider ?? ''}`,
            icon: <IntegrationLogo provider={i.provider} className="size-7 rounded-[3.7px] p-[3.48px] bg-transparent border-transparent" />
        }));
        if (playgroundIntegration && !opts.some((o) => o.value === playgroundIntegration)) {
            opts.unshift({ value: playgroundIntegration, label: playgroundIntegration, filterValue: playgroundIntegration });
        }
        return opts;
    }, [integrations, playgroundIntegration]);

    const handleIntegrationChange = useCallback(
        (val: string) => {
            setPlaygroundIntegration(val);
            setPlaygroundInputErrors({});
            setPlaygroundResult(null);
            setPlaygroundPendingOperationId(null);
            setPlaygroundRunning(false);
        },
        [setPlaygroundIntegration, setPlaygroundInputErrors, setPlaygroundResult, setPlaygroundPendingOperationId, setPlaygroundRunning]
    );

    const handleConnectionChange = useCallback(
        (val: string) => {
            setPlaygroundConnection(val);
            setPlaygroundResult(null);
            setPlaygroundPendingOperationId(null);
            setPlaygroundRunning(false);
        },
        [setPlaygroundConnection, setPlaygroundResult, setPlaygroundPendingOperationId, setPlaygroundRunning]
    );

    const handleFunctionChange = useCallback(
        (val: string) => {
            const flow = allFlows.find((f) => f.name === val);
            if (flow) setPlaygroundFunction(val, flow.resolvedType);
            setPlaygroundInputErrors({});
            setPlaygroundResult(null);
            setPlaygroundPendingOperationId(null);
            setPlaygroundRunning(false);
        },
        [allFlows, setPlaygroundFunction, setPlaygroundInputErrors, setPlaygroundResult, setPlaygroundPendingOperationId, setPlaygroundRunning]
    );

    return (
        <div className="grid grid-cols-[110px_1fr] items-center gap-x-4 gap-y-6">
            <label className="text-text-primary text-label-large">Integration</label>
            <ComboboxSelect
                value={playgroundIntegration || ''}
                onValueChange={handleIntegrationChange}
                placeholder="Pick integration"
                disabled={running}
                options={integrationOptions}
                searchPlaceholder="Search integrations"
                showCheckbox={false}
                emptyText="No integrations found"
                footer={
                    <div className="flex items-center justify-between gap-3">
                        <span className="flex items-center justify-center gap-2 text-text-tertiary text-body-small-regular">Need a new integration?</span>
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="h-auto rounded-full bg-btn-secondary-bg px-2 py-1 text-body-small-regular gap-0.5 justify-center items-center text-text-primary"
                            onClick={() => {
                                setPlaygroundOpen(false);
                                navigate(`/${env}/integrations/create`);
                            }}
                        >
                            <Plus /> Add
                        </Button>
                    </div>
                }
            />

            <label className="text-text-primary text-label-large">Connection</label>
            <ComboboxSelect
                value={playgroundConnection || ''}
                onValueChange={handleConnectionChange}
                placeholder="Select connection"
                disabled={running || !playgroundIntegration}
                options={connectionOptions}
                searchPlaceholder="Search connections"
                searchValue={connectionSearch}
                onSearchValueChange={setPlaygroundConnectionSearch}
                showCheckbox={false}
                emptyText="No connections found"
                footer={
                    <div className="flex items-center justify-between gap-3">
                        <span className="flex items-center justify-center gap-2 text-text-tertiary text-body-small-regular">Need a new connection?</span>
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="h-auto rounded-full bg-btn-secondary-bg px-2 py-1 text-body-small-regular gap-0.5 justify-center items-center text-text-primary"
                            onClick={() => {
                                setPlaygroundOpen(false);
                                navigate(`/${env}/connections/create${playgroundIntegration ? `?integration_id=${playgroundIntegration}` : ''}`);
                            }}
                        >
                            <Plus /> Add
                        </Button>
                    </div>
                }
            />

            <label className="text-text-primary text-label-large">Function</label>
            <ComboboxSelect
                value={playgroundFunction || ''}
                onValueChange={handleFunctionChange}
                placeholder="Select function"
                disabled={running || !playgroundIntegration}
                options={functionOptions}
                searchPlaceholder="Search functions"
                showCheckbox={false}
                emptyText="No functions found"
                footer={
                    playgroundIntegration ? (
                        <div className="flex items-center justify-between gap-3">
                            <span className="flex items-center justify-center gap-2 text-text-tertiary text-body-small-regular">Activate more functions</span>
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                className="h-auto rounded-full bg-btn-secondary-bg px-2 py-1 text-body-small-regular gap-0.5 justify-center items-center text-text-primary"
                                onClick={() => {
                                    setPlaygroundOpen(false);
                                    navigate(`/${env}/integrations/${playgroundIntegration}`);
                                }}
                            >
                                Activate <ExternalLink />
                            </Button>
                        </div>
                    ) : undefined
                }
            />
        </div>
    );
};
