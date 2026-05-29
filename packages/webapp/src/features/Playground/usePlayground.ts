import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';

import { buildResultData, computeDurationMs, fetchOperation, findOperation, sleepWithAbort, validateAndParseInputs } from './playground.utils';
import { useStore } from '@/store';
import { usePlaygroundStore } from '@/store/playground';
import { apiFetch } from '@/utils/api';

import type { InputField } from './types';
import type { SyncResponse } from '@/types';

const FIND_OP_POLL_INTERVAL_MS = 500;
const STATUS_POLL_INTERVAL_MS = 1500;

export function usePlayground(inputFields: InputField[]) {
    const env = useStore((s) => s.env);
    const isOpen = usePlaygroundStore((s) => s.isOpen);
    const playgroundIntegration = usePlaygroundStore((s) => s.integration);
    const playgroundConnection = usePlaygroundStore((s) => s.connection);
    const playgroundFunction = usePlaygroundStore((s) => s.function);
    const playgroundFunctionType = usePlaygroundStore((s) => s.functionType);
    const inputValues = usePlaygroundStore((s) => s.inputValues);
    const pendingOperationId = usePlaygroundStore((s) => s.pendingOperationId);
    const setResult = usePlaygroundStore((s) => s.setResult);
    const setPendingOperationId = usePlaygroundStore((s) => s.setPendingOperationId);
    const setRunning = usePlaygroundStore((s) => s.setRunning);
    const setInputErrors = usePlaygroundStore((s) => s.setInputErrors);
    const setAbortActiveRun = usePlaygroundStore((s) => s.setAbortActiveRun);

    const runAbortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        setAbortActiveRun(() => {
            runAbortRef.current?.abort();
            setPendingOperationId(null);
            setRunning(false);
            setResult(null);
        });

        return () => {
            setAbortActiveRun(null);
        };
    }, [setAbortActiveRun, setPendingOperationId, setResult, setRunning]);

    // --- useQuery: poll operation status when pendingOperationId is set ---
    const { data: operationData } = useQuery({
        queryKey: ['playground-operation', env, pendingOperationId],
        queryFn: async () => {
            if (!pendingOperationId) {
                return null;
            }

            return fetchOperation(pendingOperationId, env);
        },
        enabled: !!pendingOperationId && isOpen,
        refetchInterval: (query) => {
            const state = query.state.data?.state;
            // Keep polling if data is null (transient fetch failure) or still in progress.
            // Only stop on a known terminal state.
            if (state && state !== 'running' && state !== 'waiting') return false;
            return STATUS_POLL_INTERVAL_MS;
        }
    });

    // --- Process terminal state from useQuery ---
    useEffect(() => {
        if (!operationData || !pendingOperationId) return;
        const state = operationData.state as string;
        if (state === 'running' || state === 'waiting') {
            // Still in progress — ensure UI shows running state (handles reattach case)
            setRunning(true);
            return;
        }

        // Terminal — process result
        const success = state === 'success';
        const durationMs = computeDurationMs(operationData);
        const data = buildResultData(operationData);

        setPendingOperationId(null);
        setResult({ success, state, data, durationMs, operationId: pendingOperationId });
        setRunning(false);
    }, [operationData, pendingOperationId, setResult, setPendingOperationId, setRunning]);

    // --- handleRun ---
    const handleRun = useCallback(async () => {
        if (!playgroundIntegration || !playgroundConnection || !playgroundFunction || !playgroundFunctionType) return;

        const controller = new AbortController();
        runAbortRef.current = controller;
        setRunning(true);
        setResult(null);
        setInputErrors({});

        const runStartTime = Date.now();
        try {
            let response: Response;
            let triggerData: unknown = null;

            const triggerStartTime = Date.now();
            if (playgroundFunctionType === 'action') {
                const parseResult = validateAndParseInputs(inputFields, inputValues);
                if (!parseResult.ok) {
                    setInputErrors(parseResult.errors);
                    setResult({ success: false, state: 'invalid_input', data: { error: 'Invalid input', fields: parseResult.errors }, durationMs: 0 });
                    setRunning(false);
                    return;
                }
                response = await apiFetch(`/api/v1/trigger/function?env=${env}`, {
                    method: 'POST',
                    signal: controller.signal,
                    body: JSON.stringify({
                        type: 'action',
                        function_name: playgroundFunction,
                        provider_config_key: playgroundIntegration,
                        connection_id: playgroundConnection,
                        input: parseResult.parsed
                    })
                });
            } else {
                response = await apiFetch(`/api/v1/trigger/function?env=${env}`, {
                    method: 'POST',
                    signal: controller.signal,
                    body: JSON.stringify({
                        type: 'sync',
                        function_name: playgroundFunction,
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

            // If the trigger failed immediately, surface the error right away.
            if (!response.ok) {
                setPendingOperationId(null);
                setResult({ success: false, data: triggerData, durationMs: triggerDurationMs });
                setRunning(false);
                return;
            }

            // For actions, the full output is already in triggerData.
            // Don't block the UI on log discovery.
            if (playgroundFunctionType === 'action') {
                setPendingOperationId(null);
                setResult({ success: true, data: triggerData, durationMs: triggerDurationMs });
                setRunning(false);
                return;
            }

            // Poll until we find the matching operation in logs.
            const findDeadlineMs = playgroundFunctionType === 'sync' ? 15_000 : 5_000;
            const findStart = Date.now();
            let operation = null as Awaited<ReturnType<typeof findOperation>>;
            while (Date.now() - findStart < findDeadlineMs) {
                operation = await findOperation(
                    {
                        env,
                        triggerStartTime,
                        functionType: playgroundFunctionType,
                        integration: playgroundIntegration,
                        connection: playgroundConnection,
                        functionName: playgroundFunction
                    },
                    controller.signal
                );
                if (operation) break;
                await sleepWithAbort(FIND_OP_POLL_INTERVAL_MS, controller.signal);
            }

            if (!operation) {
                setPendingOperationId(null);
                setResult({ success: true, state: 'operation_not_found', data: triggerData, durationMs: triggerDurationMs });
                setRunning(false);
                return;
            }

            // Syncs: hand off to useQuery for status polling.
            // running stays true — useQuery's useEffect will set it to false on terminal state.
            setPendingOperationId(operation.id);
        } catch (err: unknown) {
            if (err instanceof Error && err.name === 'AbortError') {
                setPendingOperationId(null);
                setResult(null);
            } else {
                setPendingOperationId(null);
                setResult({ success: false, data: { error: 'Network error' }, durationMs: Date.now() - runStartTime });
            }
            setRunning(false);
        } finally {
            runAbortRef.current = null;
        }
    }, [
        playgroundIntegration,
        playgroundConnection,
        playgroundFunction,
        playgroundFunctionType,
        env,
        inputFields,
        inputValues,
        setResult,
        setPendingOperationId,
        setRunning,
        setInputErrors
    ]);

    // --- handleCancel ---
    const handleCancel = useCallback(async () => {
        runAbortRef.current?.abort();
        setPendingOperationId(null);
        setRunning(false);
        setResult(null);

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
    }, [env, playgroundIntegration, playgroundConnection, playgroundFunction, playgroundFunctionType, setPendingOperationId, setRunning, setResult]);

    return { handleRun, handleCancel };
}
