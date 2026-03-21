import { ExternalLink, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { IntegrationLogo } from '../IntegrationLogo';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Combobox } from '../ui/combobox';
import { useConnections } from '@/hooks/useConnections';
import { useGetIntegrationFlows, useListIntegrations } from '@/hooks/useIntegration';
import { useStore } from '@/store';

import type { NangoSyncConfig } from '@nangohq/types';

interface Props {
    env: string;
    queryEnv: string;
}

export const PlaygroundSelectors: React.FC<Props> = ({ env, queryEnv }) => {
    const navigate = useNavigate();

    const playgroundIntegration = useStore((s) => s.playground.integration);
    const playgroundConnection = useStore((s) => s.playground.connection);
    const playgroundFunction = useStore((s) => s.playground.function);
    const connectionSearch = useStore((s) => s.playground.connectionSearch);
    const setPlaygroundOpen = useStore((s) => s.setPlaygroundOpen);
    const setPlaygroundIntegration = useStore((s) => s.setPlaygroundIntegration);
    const setPlaygroundConnection = useStore((s) => s.setPlaygroundConnection);
    const setPlaygroundFunction = useStore((s) => s.setPlaygroundFunction);
    const setPlaygroundResult = useStore((s) => s.setPlaygroundResult);
    const setPlaygroundInputErrors = useStore((s) => s.setPlaygroundInputErrors);
    const setPlaygroundConnectionSearch = useStore((s) => s.setPlaygroundConnectionSearch);
    const setPlaygroundPendingOperationId = useStore((s) => s.setPlaygroundPendingOperationId);
    const setPlaygroundRunning = useStore((s) => s.setPlaygroundRunning);

    const [debouncedConnectionSearch, setDebouncedConnectionSearch] = useState('');

    useEffect(() => {
        if (!connectionSearch) {
            setDebouncedConnectionSearch('');
            return;
        }
        const t = window.setTimeout(() => setDebouncedConnectionSearch(connectionSearch), 250);
        return () => window.clearTimeout(t);
    }, [connectionSearch]);

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

    const flowByName = useMemo(() => new Map(allFlows.map((f) => [f.name, f] as const)), [allFlows]);

    const functionOptions = useMemo(() => {
        const opts = allFlows.filter((f) => f.enabled === true).map((f) => ({ value: f.name, label: f.name, filterValue: `${f.name} ${f.resolvedType}` }));
        if (playgroundFunction && !opts.some((o) => o.value === playgroundFunction)) {
            opts.unshift({ value: playgroundFunction, label: playgroundFunction, filterValue: playgroundFunction });
        }
        return opts;
    }, [allFlows, playgroundFunction]);

    const integrationByKey = useMemo(() => {
        const list = integrations?.data ?? [];
        return new Map(list.map((i) => [i.unique_key, i] as const));
    }, [integrations]);

    const integrationOptions = useMemo(() => {
        const list = integrations?.data ?? [];
        const opts = list.map((i) => ({
            value: i.unique_key,
            label: i.display_name || i.unique_key,
            filterValue: `${i.display_name ?? ''} ${i.unique_key ?? ''} ${i.provider ?? ''}`
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
            <Combobox
                value={playgroundIntegration || ''}
                onValueChange={handleIntegrationChange}
                placeholder="Pick integration"
                options={integrationOptions}
                searchPlaceholder="Search integrations"
                showCheckbox={false}
                emptyText="No integrations found"
                renderValue={(opt) => {
                    const integration = integrationByKey.get(opt.value);
                    if (!integration) return <span className="truncate">{opt.label}</span>;
                    return (
                        <>
                            <IntegrationLogo provider={integration.provider} className="p-0 size-6 rounded-[3.7px] bg-transparent border-transparent" />
                            <span className="truncate">{integration.display_name || integration.unique_key}</span>
                        </>
                    );
                }}
                renderOption={(opt) => {
                    const integration = integrationByKey.get(opt.value);
                    if (!integration) return <span className="truncate">{opt.label}</span>;
                    return (
                        <>
                            <IntegrationLogo provider={integration.provider} className="size-7 rounded-[3.7px] p-[3.48px] bg-transparent border-transparent" />
                            <span className="truncate">{integration.display_name || integration.unique_key}</span>
                        </>
                    );
                }}
                footer={
                    <div className="flex items-center justify-between gap-3">
                        <span className="flex items-center justify-center gap-2 text-text-tertiary text-body-small-regular">Need a new integration?</span>
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="h-auto rounded-full bg-btn-secondary-bg px-2 py-1 text-body-small-regular gap-0.5 justify-center items-center"
                            onClick={() => {
                                setPlaygroundOpen(false);
                                navigate(`/${env}/integrations/create`);
                            }}
                        >
                            <Plus className="size-4" /> Add
                        </Button>
                    </div>
                }
            />

            <label className="text-text-primary text-label-large">Connection</label>
            <Combobox
                value={playgroundConnection || ''}
                onValueChange={handleConnectionChange}
                placeholder="Select connection"
                disabled={!playgroundIntegration}
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
                            className="h-auto rounded-full bg-btn-secondary-bg px-2 py-1 text-body-small-regular gap-0.5 justify-center items-center"
                            onClick={() => {
                                setPlaygroundOpen(false);
                                navigate(`/${env}/connections/create${playgroundIntegration ? `?integration_id=${playgroundIntegration}` : ''}`);
                            }}
                        >
                            <Plus className="size-4" /> Add
                        </Button>
                    </div>
                }
            />

            <label className="text-text-primary text-label-large">Function</label>
            <Combobox
                value={playgroundFunction || ''}
                onValueChange={handleFunctionChange}
                placeholder="Select function"
                disabled={!playgroundIntegration}
                options={functionOptions}
                searchPlaceholder="Search functions"
                showCheckbox={false}
                emptyText="No functions found"
                renderValue={(opt) => {
                    const flow = flowByName.get(opt.value);
                    return (
                        <>
                            <span className="truncate">{opt.label}</span>
                            {flow && (
                                <Badge variant="gray" size="xs" className="capitalize font-mono">
                                    {flow.resolvedType}
                                </Badge>
                            )}
                        </>
                    );
                }}
                renderOption={(opt) => <span className="truncate">{opt.label}</span>}
                renderOptionRight={(opt) => {
                    const flow = flowByName.get(opt.value);
                    if (!flow) return null;
                    return (
                        <span className="flex h-5 min-w-5 items-center justify-center gap-1 rounded-[4px] bg-bg-elevated px-1 text-body-small-regular text-text-primary capitalize">
                            {flow.resolvedType}
                        </span>
                    );
                }}
                footer={
                    playgroundIntegration ? (
                        <div className="flex items-center justify-between gap-3">
                            <span className="flex items-center justify-center gap-2 text-text-tertiary text-body-small-regular">Activate more functions</span>
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                className="h-auto rounded-full bg-btn-secondary-bg px-2 py-1 text-body-small-regular gap-0.5 justify-center items-center"
                                onClick={() => {
                                    setPlaygroundOpen(false);
                                    navigate(`/${env}/integrations/${playgroundIntegration}`);
                                }}
                            >
                                Activate <ExternalLink className="size-4" />
                            </Button>
                        </div>
                    ) : undefined
                }
            />
        </div>
    );
};
