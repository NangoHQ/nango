import { useCallback, useRef } from 'react';

import { useEnvironment } from '@/hooks/useEnvironment';
import { useStore } from '@/store';
import { usePlaygroundStore } from '@/store/playground';
import { apiFetch } from '@/utils/api';

import type { InputField } from './types';
import type { SyncResponse } from '@/types';
import type { GetOperation, SearchOperations } from '@nangohq/types';

function validateConstraints(field: InputField, value: unknown): string | null {
    if (field.enum !== undefined) {
        if (!field.enum.includes(value)) {
            return `Must be one of: ${field.enum.map(String).join(', ')}`;
        }
        return null;
    }
    if (field.type === 'string' && typeof value === 'string') {
        if (field.minLength != null && value.length < field.minLength) {
            return `Must be at least ${field.minLength} character${field.minLength === 1 ? '' : 's'}`;
        }
        if (field.maxLength != null && value.length > field.maxLength) {
            return `Must be at most ${field.maxLength} character${field.maxLength === 1 ? '' : 's'}`;
        }
        if (field.pattern != null && !new RegExp(field.pattern).test(value)) {
            return `Must match pattern: ${field.pattern}`;
        }
    }
    if ((field.type === 'number' || field.type === 'integer') && typeof value === 'number') {
        if (field.minimum != null && value < field.minimum) return `Must be ≥ ${field.minimum}`;
        if (field.maximum != null && value > field.maximum) return `Must be ≤ ${field.maximum}`;
        if (field.exclusiveMinimum != null && value <= field.exclusiveMinimum) return `Must be > ${field.exclusiveMinimum}`;
        if (field.exclusiveMaximum != null && value >= field.exclusiveMaximum) return `Must be < ${field.exclusiveMaximum}`;
    }
    return null;
}

export function usePlaygroundRun(inputFields: InputField[]) {
    const env = useStore((s) => s.env);
    const baseUrl = useStore((s) => s.baseUrl);
    const playgroundIntegration = usePlaygroundStore((s) => s.integration);
    const playgroundConnection = usePlaygroundStore((s) => s.connection);
    const playgroundFunction = usePlaygroundStore((s) => s.function);
    const playgroundFunctionType = usePlaygroundStore((s) => s.functionType);
    const inputValues = usePlaygroundStore((s) => s.inputValues);
    const setPlaygroundResult = usePlaygroundStore((s) => s.setResult);
    const setPlaygroundPendingOperationId = usePlaygroundStore((s) => s.setPendingOperationId);
    const setPlaygroundRunning = usePlaygroundStore((s) => s.setRunning);
    const setPlaygroundInputErrors = usePlaygroundStore((s) => s.setInputErrors);

    const { environmentAndAccount } = useEnvironment(env);
    const abortRef = useRef<AbortController | null>(null);

    const handleRun = useCallback(async () => {
        if (!playgroundIntegration || !playgroundConnection || !playgroundFunction || !playgroundFunctionType || !environmentAndAccount) return;

        const secretKey = environmentAndAccount.environment.secret_key;
        const controller = new AbortController();
        abortRef.current = controller;
        setPlaygroundRunning(true);
        setPlaygroundResult(null);
        setPlaygroundInputErrors({});

        const runStartTime = Date.now();
        let isRunning = false;
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

                    let parsed: unknown;
                    try {
                        switch (field.type) {
                            case 'number': {
                                const n = Number(trimmed);
                                if (!Number.isFinite(n)) throw new Error('Expected a number');
                                parsed = n;
                                break;
                            }
                            case 'integer': {
                                const n = Number(trimmed);
                                if (!Number.isFinite(n) || !Number.isInteger(n)) throw new Error('Expected an integer');
                                parsed = n;
                                break;
                            }
                            case 'boolean': {
                                const v = trimmed.toLowerCase();
                                if (v !== 'true' && v !== 'false') throw new Error('Expected true or false');
                                parsed = v === 'true';
                                break;
                            }
                            case 'object': {
                                const p = JSON.parse(trimmed);
                                if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('Expected a JSON object');
                                parsed = p;
                                break;
                            }
                            case 'array': {
                                const p = JSON.parse(trimmed);
                                if (!Array.isArray(p)) throw new Error('Expected a JSON array');
                                parsed = p;
                                break;
                            }
                            default:
                                parsed = raw;
                        }
                    } catch (err) {
                        errors[field.name] = err instanceof Error ? err.message : 'Invalid value';
                        continue;
                    }

                    const constraintError = validateConstraints(field, parsed);
                    if (constraintError) {
                        errors[field.name] = constraintError;
                        continue;
                    }

                    parsedInput[field.name] = parsed;
                }

                if (Object.keys(errors).length > 0) {
                    setPlaygroundInputErrors(errors);
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

            const sleep = (ms: number) =>
                new Promise<void>((resolve, reject) => {
                    const onAbort = () => {
                        window.clearTimeout(t);
                        reject(new DOMException('Aborted', 'AbortError'));
                    };
                    const t = window.setTimeout(() => {
                        controller.signal.removeEventListener('abort', onAbort);
                        resolve();
                    }, ms);
                    if (controller.signal.aborted) {
                        onAbort();
                        return;
                    }
                    controller.signal.addEventListener('abort', onAbort);
                });

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

                if (!res.ok) return null;

                const json = (await res.json()) as SearchOperations['Success'];
                if (!json.data || json.data.length === 0) return null;

                const windowStart = triggerStartTime - 15_000;
                const candidates = json.data
                    .map((op) => ({ op, ts: new Date(op.createdAt).getTime() }))
                    .filter(({ ts, op }) => {
                        if (Number.isNaN(ts) || ts < windowStart) return false;
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
                if (!res.ok) return null;
                const json = (await res.json()) as GetOperation['Success'];
                return json.data;
            };

            // If the trigger failed immediately (non-2xx), skip polling and surface the error right away.
            if (!response.ok) {
                setPlaygroundResult({ success: false, data: triggerData, durationMs: triggerDurationMs });
                return;
            }

            // Poll until we find the matching operation in logs.
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
            // Persist so re-attach can resume if the user navigates/refreshes mid-run.
            setPlaygroundPendingOperationId(operationId);
            let operationDetails = await fetchOperation(operationId);

            // Poll until the operation is terminal (best-effort, don't block too long).
            // usePlaygroundReattach takes over if it's still running after this window.
            const maxPollMs = playgroundFunctionType === 'sync' ? 30_000 : 15_000;
            const pollStart = Date.now();
            while (operationDetails && (operationDetails.state === 'waiting' || operationDetails.state === 'running')) {
                if (Date.now() - pollStart > maxPollMs) break;
                await sleep(1000);
                operationDetails = await fetchOperation(operationId);
            }

            const opDurationMs =
                operationDetails?.durationMs ??
                (operationDetails?.startedAt && operationDetails.endedAt
                    ? new Date(operationDetails.endedAt).getTime() - new Date(operationDetails.startedAt).getTime()
                    : undefined);

            const state = (operationDetails?.state ?? operation.state) as string | undefined;
            isRunning = state === 'waiting' || state === 'running';
            const success = !isRunning && state === 'success';
            const durationMs = !isRunning ? (opDurationMs && !Number.isNaN(opDurationMs) ? opDurationMs : triggerDurationMs) : Date.now() - triggerStartTime;

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

            if (!isRunning) {
                setPlaygroundPendingOperationId(null);
                setPlaygroundResult({ success, state, data: resultData, durationMs, operationId });
            }
            // If still running, leave pendingOperationId set and running=true —
            // usePlaygroundReattach picks up from here without interrupting the spinner.
        } catch (err: unknown) {
            isRunning = false;
            if (err instanceof Error && err.name === 'AbortError') {
                setPlaygroundPendingOperationId(null);
                setPlaygroundResult(null);
            } else {
                setPlaygroundPendingOperationId(null);
                setPlaygroundResult({ success: false, data: { error: 'Network error' }, durationMs: Date.now() - runStartTime });
            }
        } finally {
            // Only release running if we're not handing off to usePlaygroundReattach.
            if (!isRunning) {
                setPlaygroundRunning(false);
            }
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
        setPlaygroundResult,
        setPlaygroundPendingOperationId,
        setPlaygroundRunning,
        setPlaygroundInputErrors
    ]);

    const handleCancel = useCallback(async () => {
        // Abort local polling immediately
        abortRef.current?.abort();
        setPlaygroundPendingOperationId(null);
        setPlaygroundRunning(false);
        setPlaygroundResult(null);

        // For syncs, also cancel the backend operation (best-effort)
        if (playgroundFunctionType === 'sync' && playgroundIntegration && playgroundConnection && playgroundFunction) {
            try {
                const res = await apiFetch(
                    `/api/v1/sync?env=${env}&connection_id=${encodeURIComponent(playgroundConnection)}&provider_config_key=${encodeURIComponent(playgroundIntegration)}`
                );
                if (res.ok) {
                    const syncs = (await res.json()) as SyncResponse[];
                    const sync = syncs.find((s) => s.name === playgroundFunction);
                    if (sync) {
                        await apiFetch(`/api/v1/sync/command?env=${env}`, {
                            method: 'POST',
                            body: JSON.stringify({
                                command: 'CANCEL',
                                schedule_id: sync.schedule_id,
                                nango_connection_id: sync.nango_connection_id,
                                sync_id: sync.id,
                                sync_name: sync.name,
                                sync_variant: sync.variant,
                                provider: playgroundIntegration
                            })
                        });
                    }
                }
            } catch {
                // Best-effort: local state already cleared
            }
        }
    }, [
        env,
        playgroundIntegration,
        playgroundConnection,
        playgroundFunction,
        playgroundFunctionType,
        setPlaygroundPendingOperationId,
        setPlaygroundRunning,
        setPlaygroundResult
    ]);

    return { handleRun, handleCancel };
}
