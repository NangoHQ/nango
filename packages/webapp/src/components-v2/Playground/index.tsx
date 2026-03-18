import { Braces, CheckCircle2, ExternalLink, Info, Play, Plus, RotateCcw, Trash2, X, XCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { CodeBlock } from '../CodeBlock';
import { IntegrationLogo } from '../IntegrationLogo';
import { Alert, AlertActions, AlertButton, AlertButtonLink, AlertDescription } from '../ui/alert';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Combobox } from '../ui/combobox';
import { Input } from '../ui/input';
import { Separator } from '../ui/separator';
import { Sheet, SheetContent } from '../ui/sheet';
import { useConnection, useConnections } from '@/hooks/useConnections';
import { useEnvironment } from '@/hooks/useEnvironment';
import { useGetIntegrationFlows, useListIntegrations } from '@/hooks/useIntegration';
import { useStore } from '@/store';
import { apiFetch } from '@/utils/api';
import { getLogsUrl } from '@/utils/logs';
import { cn } from '@/utils/utils';

import type { GetOperation, NangoSyncConfig, SearchOperations } from '@nangohq/types';
import type { JSONSchema7 } from 'json-schema';

interface InputField {
    name: string;
    type: string;
    description?: string;
    required: boolean;
}

const JSON_DISPLAY_LIMIT = 250_000;

function capitalize(value: unknown): string {
    const str = String(value);
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function getInputFields(jsonSchema: JSONSchema7 | null | undefined): InputField[] {
    if (!jsonSchema || typeof jsonSchema !== 'object') return [];
    const props = jsonSchema.properties;
    if (!props) return [];
    const required = Array.isArray(jsonSchema.required) ? jsonSchema.required : [];
    return Object.entries(props).map(([name, def]) => {
        const fieldDef = def as JSONSchema7;
        return {
            name,
            type: Array.isArray(fieldDef.type) ? fieldDef.type[0] || 'string' : fieldDef.type || 'string',
            description: fieldDef.description,
            required: required.includes(name)
        };
    });
}

export const Playground: React.FC = () => {
    const env = useStore((s) => s.env);
    const baseUrl = useStore((s) => s.baseUrl);
    const playgroundOpen = useStore((s) => s.playground.isOpen);
    const playgroundIntegration = useStore((s) => s.playground.integration);
    const playgroundConnection = useStore((s) => s.playground.connection);
    const playgroundFunction = useStore((s) => s.playground.function);
    const playgroundFunctionType = useStore((s) => s.playground.functionType);
    const setPlaygroundOpen = useStore((s) => s.setPlaygroundOpen);
    const setPlaygroundIntegration = useStore((s) => s.setPlaygroundIntegration);
    const setPlaygroundConnection = useStore((s) => s.setPlaygroundConnection);
    const setPlaygroundFunction = useStore((s) => s.setPlaygroundFunction);
    const inputValues = useStore((s) => s.playground.inputValues);
    const setPlaygroundInputValue = useStore((s) => s.setPlaygroundInputValue);
    const result = useStore((s) => s.playground.result);
    const setPlaygroundResult = useStore((s) => s.setPlaygroundResult);
    const resetPlayground = useStore((s) => s.resetPlayground);

    const navigate = useNavigate();
    const location = useLocation();

    // TODO: set to true once the records list page is ready
    const showRecordsButton = false;

    // Auto-close the sheet when the route changes (e.g. user clicks a navigation link inside the sheet)
    useEffect(() => {
        if (playgroundOpen) {
            setPlaygroundOpen(false);
        }
    }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

    const [connectionSearch, setConnectionSearch] = useState('');
    const [debouncedConnectionSearch, setDebouncedConnectionSearch] = useState('');

    useEffect(() => {
        if (!connectionSearch) {
            setDebouncedConnectionSearch('');
            return;
        }

        const t = window.setTimeout(() => {
            setDebouncedConnectionSearch(connectionSearch);
        }, 250);
        return () => {
            window.clearTimeout(t);
        };
    }, [connectionSearch]);

    const { environmentAndAccount } = useEnvironment(env);
    const queryEnv = playgroundOpen ? env : '';
    const { data: integrations } = useListIntegrations(queryEnv);
    const { data: flowsData } = useGetIntegrationFlows(queryEnv, playgroundIntegration || '');
    const connectionsQueryEnv = playgroundOpen && playgroundIntegration ? env : '';
    const connectionsQuery = useConnections({
        env: connectionsQueryEnv,
        integrationIds: playgroundIntegration ? [playgroundIntegration] : undefined,
        search: debouncedConnectionSearch || undefined
    });

    const connectionDetailsQuery = useConnection(
        { env: queryEnv, provider_config_key: playgroundIntegration || '' },
        { connectionId: playgroundConnection || '' }
    );
    const connectionMetadata = connectionDetailsQuery.data?.connection?.metadata ?? null;

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

    const flowByName = useMemo(() => {
        return new Map(allFlows.map((f) => [f.name, f] as const));
    }, [allFlows]);

    const functionOptions = useMemo(() => {
        const opts = allFlows.filter((f) => f.enabled === true).map((f) => ({ value: f.name, label: f.name, filterValue: `${f.name} ${f.resolvedType}` }));
        if (playgroundFunction && !opts.some((o) => o.value === playgroundFunction)) {
            opts.unshift({ value: playgroundFunction, label: playgroundFunction, filterValue: playgroundFunction });
        }
        return opts;
    }, [allFlows, playgroundFunction]);

    const selectedFlow = useMemo(() => {
        if (!playgroundFunction) return undefined;
        return allFlows.find((f) => f.name === playgroundFunction);
    }, [allFlows, playgroundFunction]);

    const inputSchema = useMemo((): JSONSchema7 | null => {
        if (!selectedFlow || !selectedFlow.json_schema || typeof selectedFlow.json_schema !== 'object') {
            return null;
        }

        // Most integrations store the actual input object schema under `json_schema.definitions[flow.input]`.
        const defKey = selectedFlow.input;
        const schema = (defKey ? (selectedFlow.json_schema.definitions?.[defKey] as JSONSchema7 | undefined) : undefined) || selectedFlow.json_schema;

        if (!schema || typeof schema !== 'object') {
            return null;
        }

        const props = schema.properties;
        if (!props || Object.keys(props).length === 0) {
            return null;
        }

        return schema;
    }, [selectedFlow]);

    const inputFields = useMemo(() => getInputFields(inputSchema), [inputSchema]);
    const [running, setRunning] = useState(false);
    const [inputErrors, setInputErrors] = useState<Record<string, string>>({});
    const abortRef = useRef<AbortController | null>(null);

    const integrationByKey = useMemo(() => {
        const list = integrations?.data ?? [];
        return new Map(list.map((i) => [i.unique_key, i] as const));
    }, [integrations]);

    const integrationOptions = useMemo(() => {
        const list = integrations?.data ?? [];
        const opts = list.map((integration) => ({
            value: integration.unique_key,
            label: integration.display_name || integration.unique_key,
            filterValue: `${integration.display_name ?? ''} ${integration.unique_key ?? ''} ${integration.provider ?? ''}`
        }));

        if (playgroundIntegration && !opts.some((o) => o.value === playgroundIntegration)) {
            opts.unshift({ value: playgroundIntegration, label: playgroundIntegration, filterValue: playgroundIntegration });
        }

        return opts;
    }, [integrations, playgroundIntegration]);

    const handleIntegrationChange = useCallback(
        (val: string) => {
            setPlaygroundIntegration(val);
            setInputErrors({});
            setPlaygroundResult(null);
        },
        [setPlaygroundIntegration, setPlaygroundResult]
    );

    const handleConnectionChange = useCallback(
        (val: string) => {
            setPlaygroundConnection(val);
            setPlaygroundResult(null);
        },
        [setPlaygroundConnection, setPlaygroundResult]
    );

    const handleFunctionChange = useCallback(
        (val: string) => {
            const flow = allFlows.find((f) => f.name === val);
            if (flow) {
                setPlaygroundFunction(val, flow.resolvedType);
            }
            setInputErrors({});
            setPlaygroundResult(null);
        },
        [allFlows, setPlaygroundFunction, setPlaygroundResult]
    );

    const clearInputError = useCallback((name: string) => {
        setInputErrors((prev) => {
            if (!prev[name]) {
                return prev;
            }

            const { [name]: _ignored, ...rest } = prev;
            return rest;
        });
    }, []);

    const handleRun = useCallback(async () => {
        if (!playgroundIntegration || !playgroundConnection || !playgroundFunction || !environmentAndAccount) return;

        const secretKey = environmentAndAccount.environment.secret_key;
        const controller = new AbortController();
        abortRef.current = controller;
        setRunning(true);
        setPlaygroundResult(null);
        setInputErrors({});

        const runStartTime = Date.now();
        try {
            let response: Response;
            let triggerData: unknown = null;

            const triggerStartTime = Date.now();
            if (playgroundFunctionType === 'action') {
                const parsedInput: Record<string, unknown> = {};
                const errors: Record<string, string> = {};
                for (const field of inputFields) {
                    const raw = inputValues[field.name] ?? '';
                    const trimmed = raw.trim();

                    if (!trimmed) {
                        if (field.required) {
                            errors[field.name] = 'Required';
                        }
                        continue;
                    }

                    try {
                        switch (field.type) {
                            case 'number': {
                                const n = Number(trimmed);
                                if (!Number.isFinite(n)) {
                                    throw new Error('Expected a number');
                                }
                                parsedInput[field.name] = n;
                                break;
                            }
                            case 'integer': {
                                const n = Number(trimmed);
                                if (!Number.isFinite(n) || !Number.isInteger(n)) {
                                    throw new Error('Expected an integer');
                                }
                                parsedInput[field.name] = n;
                                break;
                            }
                            case 'boolean': {
                                const v = trimmed.toLowerCase();
                                if (v !== 'true' && v !== 'false') {
                                    throw new Error('Expected true or false');
                                }
                                parsedInput[field.name] = v === 'true';
                                break;
                            }
                            case 'object': {
                                const parsed = JSON.parse(trimmed);
                                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                                    throw new Error('Expected a JSON object');
                                }
                                parsedInput[field.name] = parsed;
                                break;
                            }
                            case 'array': {
                                const parsed = JSON.parse(trimmed);
                                if (!Array.isArray(parsed)) {
                                    throw new Error('Expected a JSON array');
                                }
                                parsedInput[field.name] = parsed;
                                break;
                            }
                            default: {
                                parsedInput[field.name] = raw;
                                break;
                            }
                        }
                    } catch (err) {
                        const msg = err instanceof Error ? err.message : 'Invalid value';
                        errors[field.name] = msg;
                    }
                }

                if (Object.keys(errors).length > 0) {
                    setInputErrors(errors);
                    setPlaygroundResult({ success: false, state: 'invalid_input', data: { error: 'Invalid input', fields: errors }, durationMs: 0 });
                    return;
                }
                response = await fetch(`${baseUrl}/action/trigger`, {
                    method: 'POST',
                    signal: controller.signal,
                    headers: {
                        Authorization: `Bearer ${secretKey}`,
                        'Content-Type': 'application/json',
                        'provider-config-key': playgroundIntegration,
                        'connection-id': playgroundConnection
                    },
                    body: JSON.stringify({ action_name: playgroundFunction, input: parsedInput })
                });
            } else {
                response = await fetch(`${baseUrl}/sync/trigger`, {
                    method: 'POST',
                    signal: controller.signal,
                    headers: {
                        Authorization: `Bearer ${secretKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        syncs: [playgroundFunction],
                        provider_config_key: playgroundIntegration,
                        connection_id: playgroundConnection
                    })
                });
            }

            try {
                triggerData = await response.json();
            } catch {
                triggerData = null;
            }

            const triggerDurationMs = Date.now() - triggerStartTime;

            const sleep = (ms: number) => {
                return new Promise<void>((resolve, reject) => {
                    const t = window.setTimeout(resolve, ms);
                    const onAbort = () => {
                        window.clearTimeout(t);
                        reject(new DOMException('Aborted', 'AbortError'));
                    };

                    if (controller.signal.aborted) {
                        onAbort();
                        return;
                    }

                    controller.signal.addEventListener('abort', onAbort, { once: true });
                });
            };

            const findOperation = async () => {
                const from = new Date(triggerStartTime - 60_000).toISOString();
                const to = new Date().toISOString();

                const body: SearchOperations['Body'] = {
                    limit: 25,
                    types: [playgroundFunctionType === 'sync' ? 'sync:run' : 'action'],
                    integrations: [playgroundIntegration],
                    connections: [playgroundConnection],
                    syncs: playgroundFunctionType === 'sync' ? [playgroundFunction] : ['all'],
                    period: { from, to }
                };

                const res = await apiFetch(`/api/v1/logs/operations?env=${env}`, {
                    method: 'POST',
                    body: JSON.stringify(body),
                    signal: controller.signal
                });

                if (!res.ok) {
                    return null;
                }

                const json = (await res.json()) as SearchOperations['Success'];
                if (!json.data || json.data.length === 0) {
                    return null;
                }

                // Best-effort correlation: pick the most recent operation created around the trigger time.
                const windowStart = triggerStartTime - 15_000;
                const candidates = json.data
                    .map((op) => ({ op, ts: new Date(op.createdAt).getTime() }))
                    .filter(({ ts, op }) => {
                        if (Number.isNaN(ts)) return false;
                        if (ts < windowStart) return false;
                        if (playgroundFunctionType === 'sync' && op.syncConfigName && op.syncConfigName !== playgroundFunction) return false;
                        return true;
                    })
                    .sort((a, b) => b.ts - a.ts);

                return candidates[0]?.op ?? null;
            };

            const fetchOperation = async (operationId: string) => {
                const res = await apiFetch(`/api/v1/logs/operations/${encodeURIComponent(operationId)}?env=${env}`, {
                    method: 'GET',
                    signal: controller.signal
                });

                if (!res.ok) {
                    return null;
                }

                const json = (await res.json()) as GetOperation['Success'];
                return json.data;
            };

            // If the trigger failed immediately (non-2xx), skip polling and surface the error right away.
            if (!response.ok) {
                setPlaygroundResult({ success: false, data: triggerData, durationMs: triggerDurationMs });
                return;
            }

            // If logs are enabled, prefer showing the actual operation logs/results.
            let operation = null as SearchOperations['Success']['data'][number] | null;
            const findDeadlineMs = playgroundFunctionType === 'sync' ? 15_000 : 5_000;
            const findStart = Date.now();
            while (Date.now() - findStart < findDeadlineMs) {
                operation = await findOperation();
                if (operation) break;
                await sleep(500);
            }

            if (!operation) {
                setPlaygroundResult({ success: false, data: triggerData, durationMs: triggerDurationMs });
                return;
            }

            const operationId = operation.id;
            let operationDetails = await fetchOperation(operationId);

            // Poll until the operation is terminal (best-effort, don't block too long).
            const maxPollMs = playgroundFunctionType === 'sync' ? 30_000 : 15_000;
            const pollStart = Date.now();
            while (operationDetails && (operationDetails.state === 'waiting' || operationDetails.state === 'running')) {
                if (Date.now() - pollStart > maxPollMs) {
                    break;
                }
                await sleep(1000);
                operationDetails = await fetchOperation(operationId);
            }

            const opDurationMs =
                operationDetails?.durationMs ??
                (operationDetails?.startedAt && operationDetails.endedAt
                    ? new Date(operationDetails.endedAt).getTime() - new Date(operationDetails.startedAt).getTime()
                    : undefined);

            const state = (operationDetails?.state ?? operation.state) as string | undefined;
            const isRunning = state === 'waiting' || state === 'running';
            const success = !isRunning && state === 'success';
            const durationMs = !isRunning
                ? opDurationMs && !Number.isNaN(opDurationMs)
                    ? opDurationMs
                    : triggerDurationMs
                : // best-effort runtime when still running / timing out
                  Date.now() - triggerStartTime;

            // Mirror the payload assembly from Logs/Operation/Show.tsx
            // Fall back to the found operation row if details fetch failed
            const op = operationDetails ?? operation;
            let resultData: unknown = null;
            if (op?.meta || op?.request || op?.response || op?.error) {
                const pl: Record<string, unknown> = op.meta ? { ...op.meta } : {};
                if (op.request) pl.request = op.request;
                if (op.response) pl.response = op.response;
                if (op.error) {
                    pl.error = { message: op.error.message, ...(op.error.payload ? { payload: op.error.payload } : {}) };
                }
                resultData = pl;
            }

            setPlaygroundResult({ success, state, data: resultData, durationMs, operationId });
        } catch (err: unknown) {
            if (err instanceof Error && err.name === 'AbortError') {
                setPlaygroundResult(null);
            } else {
                const durationMs = Date.now() - runStartTime;
                setPlaygroundResult({ success: false, data: { error: 'Network error' }, durationMs });
            }
        } finally {
            setRunning(false);
            abortRef.current = null;
        }
    }, [
        playgroundIntegration,
        playgroundConnection,
        playgroundFunction,
        playgroundFunctionType,
        environmentAndAccount,
        baseUrl,
        env,
        inputFields,
        inputValues,
        setPlaygroundResult
    ]);

    const handleCancel = useCallback(() => {
        abortRef.current?.abort();
        setRunning(false);
    }, []);

    const canRun = Boolean(playgroundIntegration && playgroundConnection && playgroundFunction);
    const isSync = playgroundFunctionType === 'sync';

    let resultJson = '';
    if (result) {
        try {
            resultJson = JSON.stringify(result.data, null, 2);
        } catch {
            resultJson = String(result.data);
        }

        if (resultJson.length >= JSON_DISPLAY_LIMIT) {
            resultJson = 'Result too large to display';
        }
    }

    return (
        <>
            {/* Custom overlay — click to close the sheet, but allows interaction to pass through to the page */}
            <div
                className={cn(
                    'fixed inset-0 z-50 bg-black/30 transition-opacity duration-300 ease-in-out',
                    playgroundOpen ? 'opacity-100' : 'opacity-0 pointer-events-none invisible'
                )}
                onClick={() => setPlaygroundOpen(false)}
            />
            <Sheet open={playgroundOpen} onOpenChange={setPlaygroundOpen} modal={false}>
                <SheetContent
                    side="right"
                    overlayClassName="hidden"
                    insetTop={108}
                    insetBottom={44}
                    insetRight={24}
                    onInteractOutside={(e) => e.preventDefault()}
                    onPointerDownOutside={(e) => e.preventDefault()}
                    onFocusOutside={(e) => e.preventDefault()}
                    className={cn(
                        'bg-bg-elevated dark:bg-bg-elevated text-text-primary [border:0.5px_solid_var(--colors-border-border-muted,#2A2B2F)] rounded-[4px] [box-shadow:0_8px_24px_0_rgba(0,0,0,0.16)] p-6',
                        'flex flex-col items-start gap-[10px]',
                        'w-[537px] max-w-none sm:max-w-none',
                        'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
                        '[&>button]:hidden'
                    )}
                >
                    {/* Header */}
                    <div className="flex w-full shrink-0 items-start justify-between pb-8">
                        <div className="min-w-0">
                            <h2 className="text-text-primary text-heading-medium font-medium text-[20px] pb-2">Playground</h2>
                            <p className="text-body-regular-medium text-text-secondary text-body-medium-medium text-[14px] font-400 line-height-[160%]">
                                Quickly run any function.
                            </p>
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                            <Button variant="ghost" size="icon" className="size-7" onClick={resetPlayground} aria-label="Reset playground">
                                <Trash2 className="size-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="size-7" onClick={() => setPlaygroundOpen(false)} aria-label="Close playground">
                                <X className="size-4" />
                            </Button>
                        </div>
                    </div>

                    {/* Content — scroll is handled by SheetContent scrollable wrapper */}
                    <div className="flex w-full flex-col gap-6">
                        {/* Select rows */}
                        <div className="grid grid-cols-[110px_1fr] items-center gap-x-4 gap-y-6">
                            <label className="text-text-primary text-label-large">Integration</label>
                            <Combobox
                                value={playgroundIntegration || ''}
                                onValueChange={handleIntegrationChange}
                                placeholder="Pick integration"
                                options={integrationOptions}
                                searchPlaceholder="Search integrations"
                                showCheckbox={false}
                                renderValue={(opt) => {
                                    const integration = integrationByKey.get(opt.value);
                                    if (!integration) {
                                        return <span className="truncate">{opt.label}</span>;
                                    }

                                    return (
                                        <>
                                            <IntegrationLogo
                                                provider={integration.provider}
                                                className="p-0 size-6 rounded-[3.7px] !bg-transparent !border-transparent"
                                            />
                                            <span className="truncate">{integration.display_name || integration.unique_key}</span>
                                        </>
                                    );
                                }}
                                renderOption={(opt) => {
                                    const integration = integrationByKey.get(opt.value);
                                    if (!integration) {
                                        return <span className="truncate">{opt.label}</span>;
                                    }

                                    return (
                                        <>
                                            <IntegrationLogo
                                                provider={integration.provider}
                                                className="size-7 rounded-[3.7px] p-[3.48px] !bg-transparent !border-transparent"
                                            />
                                            <span className="truncate">{integration.display_name || integration.unique_key}</span>
                                        </>
                                    );
                                }}
                                footer={
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="flex items-center justify-center gap-2 text-text-tertiary text-body-small-regular">
                                            Need a new integration?
                                        </span>
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            className="h-auto rounded-full bg-btn-secondary-bg px-2 py-1 text-xs gap-0.5 justify-center items-center"
                                            onClick={() => {
                                                setPlaygroundOpen(false);
                                                navigate(`/${env}/integrations/create`);
                                            }}
                                        >
                                            <Plus className="size-3" /> Add
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
                                onSearchValueChange={setConnectionSearch}
                                showCheckbox={false}
                                footer={
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="flex items-center justify-center gap-2 text-text-tertiary text-body-small-regular">
                                            Need a new connection?
                                        </span>
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            className="h-auto rounded-full bg-btn-secondary-bg px-2 py-1 text-xs gap-0.5 justify-center items-center"
                                            onClick={() => {
                                                setPlaygroundOpen(false);
                                                navigate(
                                                    `/${env}/connections/create${playgroundIntegration ? `?integration_id=${playgroundIntegration}` : ''}`
                                                );
                                            }}
                                        >
                                            <Plus className="size-3" /> Add
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
                                renderValue={(opt) => {
                                    const flow = flowByName.get(opt.value);
                                    return (
                                        <>
                                            <span className="truncate">{opt.label}</span>
                                            {flow && (
                                                <Badge variant="gray" size="xs" className="normal-case font-mono">
                                                    {capitalize(flow.resolvedType)}
                                                </Badge>
                                            )}
                                        </>
                                    );
                                }}
                                renderOption={(opt) => {
                                    return <span className="truncate">{opt.label}</span>;
                                }}
                                renderOptionRight={(opt) => {
                                    const flow = flowByName.get(opt.value);
                                    if (!flow) {
                                        return null;
                                    }

                                    return (
                                        <span className="flex h-5 min-w-5 items-center justify-center gap-1 rounded-[4px] bg-bg-elevated px-1 text-body-small-regular text-text-primary">
                                            {capitalize(flow.resolvedType)}
                                        </span>
                                    );
                                }}
                                footer={
                                    playgroundIntegration ? (
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="flex items-center justify-center gap-2 text-text-tertiary text-body-small-regular">
                                                Activate more functions
                                            </span>
                                            <Button
                                                type="button"
                                                variant="secondary"
                                                size="sm"
                                                className="h-auto rounded-full bg-btn-secondary-bg px-2 py-1 text-xs gap-0.5 justify-center items-center"
                                                onClick={() => {
                                                    setPlaygroundOpen(false);
                                                    navigate(`/${env}/integrations/${playgroundIntegration}`);
                                                }}
                                            >
                                                Activate <ExternalLink className="size-3">aad </ExternalLink>
                                            </Button>
                                        </div>
                                    ) : undefined
                                }
                            />
                        </div>

                        {/* Inputs / metadata */}
                        {selectedFlow && (isSync || inputFields.length > 0) && (
                            <div className="grid grid-cols-[110px_1fr] gap-x-4">
                                <label className="text-text-primary text-label-large">{isSync ? 'Metadata' : 'Inputs'}</label>
                                <div className="min-w-0 flex flex-col gap-3">
                                    {isSync ? (
                                        <>
                                            <Alert variant="info" className="px-3 py-2" actionsBelow>
                                                <Info className="size-4" />
                                                <AlertDescription className="text-body-small-regular">
                                                    Sync inputs are read from the connection metadata, edited via the Nango API.
                                                </AlertDescription>
                                                <AlertActions>
                                                    {playgroundIntegration && playgroundConnection && (
                                                        <AlertButtonLink
                                                            to={`/${env}/connections/${playgroundIntegration}/${encodeURIComponent(playgroundConnection)}#auth`}
                                                            variant="info-secondary"
                                                            onClick={() => setPlaygroundOpen(false)}
                                                        >
                                                            View metadata
                                                        </AlertButtonLink>
                                                    )}
                                                    <AlertButton asChild variant="info">
                                                        <a
                                                            href="https://nango.dev/docs/implementation-guides/use-cases/customer-configuration"
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                        >
                                                            Docs <ExternalLink />
                                                        </a>
                                                    </AlertButton>
                                                </AlertActions>
                                            </Alert>
                                            {inputFields.length > 0 && playgroundIntegration && playgroundConnection ? (
                                                inputFields.map((field) => {
                                                    const rawValue =
                                                        connectionMetadata && typeof connectionMetadata === 'object'
                                                            ? (connectionMetadata as Record<string, unknown>)[field.name]
                                                            : undefined;
                                                    const isObjectValue = rawValue !== null && rawValue !== undefined && typeof rawValue === 'object';
                                                    return (
                                                        <div key={field.name} className="flex flex-col gap-1">
                                                            <div className="flex items-center justify-between gap-3">
                                                                <span className="text-text-primary text-body-medium-medium">
                                                                    {field.name}
                                                                    {field.required && (
                                                                        <span className="text-feedback-error-fg text-body-medium-medium">*</span>
                                                                    )}
                                                                </span>
                                                                <Badge variant="gray" size="xs" className="text-system-label-small">
                                                                    {capitalize(field.type)}
                                                                </Badge>
                                                            </div>
                                                            {isObjectValue ? (
                                                                <CodeBlock
                                                                    language="json"
                                                                    displayLanguage="JSON"
                                                                    icon={<Braces />}
                                                                    code={
                                                                        JSON.stringify(rawValue, null, 2).length < JSON_DISPLAY_LIMIT
                                                                            ? JSON.stringify(rawValue, null, 2)
                                                                            : 'Value too large to display'
                                                                    }
                                                                    constrainHeight={false}
                                                                />
                                                            ) : (
                                                                <p className="text-text-tertiary text-[12px]">
                                                                    {rawValue !== undefined && rawValue !== null ? JSON.stringify(rawValue, null, 2) : '—'}
                                                                </p>
                                                            )}
                                                        </div>
                                                    );
                                                })
                                            ) : !playgroundIntegration || !playgroundConnection ? (
                                                <div className="text-text-tertiary text-body-small-regular">Select a connection to view its metadata.</div>
                                            ) : (
                                                <div className="text-text-tertiary text-body-small-regular">This sync doesn&apos;t take inputs.</div>
                                            )}
                                        </>
                                    ) : (
                                        inputFields.map((field) => (
                                            <div key={field.name} className="flex flex-col gap-1">
                                                <div className="flex items-center justify-between gap-3">
                                                    <span className="text-text-primary text-body-medium-medium">
                                                        {field.name}
                                                        {field.required && <span className="text-feedback-error-fg text-body-medium-medium">*</span>}
                                                    </span>
                                                    <Badge variant="gray" size="xs" className="normal-case font-mono shrink-0">
                                                        {capitalize(field.type)}
                                                    </Badge>
                                                </div>
                                                {field.description && <p className="text-text-tertiary text-xs">{field.description}</p>}
                                                <Input
                                                    value={inputValues[field.name] || ''}
                                                    aria-invalid={Boolean(inputErrors[field.name])}
                                                    placeholder={field.type === 'object' ? '{}' : field.type === 'array' ? '[]' : undefined}
                                                    onChange={(e) => {
                                                        setPlaygroundInputValue(field.name, e.target.value);
                                                        clearInputError(field.name);
                                                    }}
                                                />
                                                {inputErrors[field.name] && <p className="text-feedback-error-fg text-xs">{inputErrors[field.name]}</p>}
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Run controls */}
                        <div className="pt-1 flex gap-2">
                            {running ? (
                                <>
                                    <Button variant="primary" disabled loading={true} size="sm">
                                        Running
                                    </Button>
                                    <Button variant="destructive" size="sm" onClick={handleCancel}>
                                        <X className="size-4" />
                                        Cancel run
                                    </Button>
                                </>
                            ) : result ? (
                                <Button variant="primary" size="sm" onClick={handleRun} disabled={!canRun}>
                                    <RotateCcw className="size-4" />
                                    Run again
                                </Button>
                            ) : (
                                <Button variant="primary" size="sm" onClick={handleRun} disabled={!canRun}>
                                    <Play className="size-4" />
                                    Run
                                </Button>
                            )}
                        </div>

                        {/* Results */}
                        {result && (
                            <>
                                <Separator className="bg-border-muted" />
                                <div className="flex flex-col gap-3">
                                    <p className="text-text-primary text-body-small-semi">Results</p>

                                    <Alert
                                        variant={result.state === 'waiting' || result.state === 'running' ? 'info' : result.success ? 'success' : 'error'}
                                        className="px-3 py-2"
                                    >
                                        {result.state === 'waiting' || result.state === 'running' ? (
                                            <Info className="size-4" />
                                        ) : result.success ? (
                                            <CheckCircle2 className="size-4" />
                                        ) : (
                                            <XCircle className="size-4" />
                                        )}
                                        <AlertDescription className="text-body-small-regular">
                                            {result.state === 'invalid_input'
                                                ? 'Invalid input (see details below)'
                                                : result.state === 'metadata_update_failed'
                                                  ? 'Failed to update connection metadata'
                                                  : result.state === 'waiting' || result.state === 'running'
                                                    ? `Running for ${(result.durationMs / 1000).toFixed(1)}s`
                                                    : result.success
                                                      ? `Ran in ${(result.durationMs / 1000).toFixed(1)}s`
                                                      : `Failed after ${(result.durationMs / 1000).toFixed(1)}s`}
                                        </AlertDescription>
                                        <AlertActions>
                                            {isSync && playgroundIntegration && playgroundConnection && showRecordsButton && (
                                                <AlertButtonLink
                                                    to={`/${env}/connections/${playgroundIntegration}/${encodeURIComponent(playgroundConnection)}`}
                                                    variant={result.success ? 'success-secondary' : 'error-secondary'}
                                                    onClick={() => setPlaygroundOpen(false)}
                                                >
                                                    Records
                                                </AlertButtonLink>
                                            )}
                                            {playgroundIntegration && playgroundConnection && playgroundFunction && (
                                                <AlertButtonLink
                                                    to={getLogsUrl({
                                                        env,
                                                        ...(result.operationId ? { operationId: result.operationId } : {}),
                                                        integrations: playgroundIntegration,
                                                        connections: playgroundConnection,
                                                        syncs: playgroundFunction,
                                                        live: true
                                                    })}
                                                    variant={result.success ? 'success' : 'error'}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                >
                                                    Logs <ExternalLink />
                                                </AlertButtonLink>
                                            )}
                                        </AlertActions>
                                    </Alert>

                                    <CodeBlock language="json" displayLanguage="JSON" icon={<Braces />} code={resultJson} constrainHeight={false} />
                                </div>
                            </>
                        )}
                    </div>
                </SheetContent>
            </Sheet>
        </>
    );
};
