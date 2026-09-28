import { ExternalLink, Plus } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDebounce } from 'react-use';

import { Badge, Button, FieldLabel } from '@nangohq/design-system';

import { IntegrationLogo } from '@/components/patterns/IntegrationLogo';
import { ComboboxSelect } from '@/components/ui/Combobox';
import { useConnections } from '@/hooks/useConnections';
import { useListIntegrations } from '@/hooks/useIntegration';
import { usePlaygroundStore } from '@/store/playground';

import type { PlaygroundFunctionRow } from './usePlaygroundFunctions';
import type { ComboboxOption } from '@/components/ui/Combobox';
import type { PlaygroundFunctionType } from '@/store/playground';

function functionOptionValue(type: Exclude<PlaygroundFunctionType, null>, name: string): string {
    return `${type}:${name}`;
}

function parseFunctionOptionValue(value: string): { type: Exclude<PlaygroundFunctionType, null>; name: string } | null {
    const separator = value.indexOf(':');
    if (separator <= 0) return null;
    const type = value.slice(0, separator);
    const name = value.slice(separator + 1);
    if ((type !== 'action' && type !== 'sync') || !name) return null;
    return { type, name };
}

interface Props {
    env: string;
    queryEnv: string;
    functions: PlaygroundFunctionRow[];
    functionsReady: boolean;
    functionsError: string | null;
    onRetryFunctions: () => void;
}

export const PlaygroundSelectors: React.FC<Props> = ({ env, queryEnv, functions, functionsReady, functionsError, onRetryFunctions }) => {
    const navigate = useNavigate();

    const playgroundIntegration = usePlaygroundStore((s) => s.integration);
    const playgroundConnection = usePlaygroundStore((s) => s.connection);
    const playgroundFunction = usePlaygroundStore((s) => s.function);
    const playgroundFunctionType = usePlaygroundStore((s) => s.functionType);
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

    const selectedFunctionValue = playgroundFunction && playgroundFunctionType ? functionOptionValue(playgroundFunctionType, playgroundFunction) : '';

    const functionOptions = useMemo(() => {
        const opts: ComboboxOption[] = functions
            .filter((fn) => fn.enabled === true)
            .map((fn) => ({
                value: functionOptionValue(fn.type, fn.name),
                label: fn.name,
                filterValue: `${fn.name} ${fn.type}`,
                tag: <Badge case="capitalize">{fn.type}</Badge>
            }));
        if (selectedFunctionValue && playgroundFunction && !opts.some((option) => option.value === selectedFunctionValue)) {
            opts.unshift({ value: selectedFunctionValue, label: playgroundFunction, filterValue: playgroundFunction });
        }
        return opts;
    }, [functions, playgroundFunction, selectedFunctionValue]);

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
            const selected = parseFunctionOptionValue(val);
            const fn = selected ? functions.find((row) => row.name === selected.name && row.type === selected.type) : undefined;
            if (fn) setPlaygroundFunction(fn.name, fn.type);
            setPlaygroundInputErrors({});
            setPlaygroundResult(null);
            setPlaygroundPendingOperationId(null);
            setPlaygroundRunning(false);
        },
        [functions, setPlaygroundFunction, setPlaygroundInputErrors, setPlaygroundResult, setPlaygroundPendingOperationId, setPlaygroundRunning]
    );

    return (
        <div className="grid grid-cols-[110px_1fr] items-center gap-x-4 gap-y-6">
            <FieldLabel>Integration</FieldLabel>
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
                        <span className="flex items-center justify-center gap-2 text-text-muted text-body-small-regular">Need a new integration?</span>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
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

            <FieldLabel>Connection</FieldLabel>
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
                        <span className="flex items-center justify-center gap-2 text-text-muted text-body-small-regular">Need a new connection?</span>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
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

            <FieldLabel>Function</FieldLabel>
            <ComboboxSelect
                value={selectedFunctionValue}
                onValueChange={handleFunctionChange}
                placeholder="Select function"
                disabled={running || !playgroundIntegration || !functionsReady}
                options={functionOptions}
                searchPlaceholder="Search functions"
                showCheckbox={false}
                emptyText="No functions found"
                footer={
                    playgroundIntegration ? (
                        <div className="flex items-center justify-between gap-3">
                            <span className="flex items-center justify-center gap-2 text-text-muted text-body-small-regular">Activate more functions</span>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
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
            {functionsError ? (
                <>
                    <span />
                    <div className="flex items-center gap-3">
                        <span className="text-body-small-regular text-text-secondary">{functionsError}</span>
                        <Button type="button" variant="outline" size="sm" onClick={onRetryFunctions}>
                            Retry
                        </Button>
                    </div>
                </>
            ) : null}
        </div>
    );
};
