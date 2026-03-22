import { useEffect, useRef } from 'react';

import { useStore } from '@/store';
import { usePlaygroundStore } from '@/store/playground';
import { apiFetch } from '@/utils/api';

import type { GetOperation } from '@nangohq/types';

const POLL_INITIAL_INTERVAL_MS = 1500;
const POLL_MAX_INTERVAL_MS = 10_000;
const POLL_BACKOFF_AFTER_MS = 30_000;

/**
 * When the playground opens and a pendingOperationId is stored, re-attaches to
 * that operation and polls until it reaches a terminal state. Sets running=true
 * during the wait so the UI shows the running state just as if the run were live.
 *
 * Polling backs off from 1.5s to 10s after the first 30s to reduce server load
 * for long-running syncs.
 *
 * Called lazily — only activates when the sheet is open.
 */
export function usePlaygroundReattach() {
    // Tracks whether a reattach loop is already running
    const reattachingRef = useRef(false);
    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        const startPolling = (pendingOperationId: string, env: string) => {
            if (reattachingRef.current) return;

            reattachingRef.current = true;
            const controller = new AbortController();
            abortRef.current = controller;

            const {
                setResult: setPlaygroundResult,
                setPendingOperationId: setPlaygroundPendingOperationId,
                setRunning: setPlaygroundRunning
            } = usePlaygroundStore.getState();
            setPlaygroundRunning(true);

            const fetchOperation = async (operationId: string): Promise<{ data: GetOperation['Success']['data'] | null; notFound: boolean }> => {
                const res = await apiFetch(`/api/v1/logs/operations/${encodeURIComponent(operationId)}?env=${env}`, {
                    method: 'GET',
                    signal: controller.signal
                });
                if (res.status === 404) return { data: null, notFound: true };
                if (!res.ok) return { data: null, notFound: false };
                const json = (await res.json()) as GetOperation['Success'];
                return { data: json.data, notFound: false };
            };

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

            void (async () => {
                try {
                    let result = await fetchOperation(pendingOperationId);

                    // Poll until terminal with no timeout. Stale operations will always be in
                    // a terminal state already, so this loop exits immediately for them.
                    // Interval backs off from 1.5s to 10s after 30s to reduce server load
                    // for long-running syncs.
                    const pollStart = Date.now();
                    while (result.data && (result.data.state === 'waiting' || result.data.state === 'running')) {
                        const elapsed = Date.now() - pollStart;
                        const interval = elapsed >= POLL_BACKOFF_AFTER_MS ? POLL_MAX_INTERVAL_MS : POLL_INITIAL_INTERVAL_MS;
                        await sleep(interval);
                        result = await fetchOperation(pendingOperationId);
                    }

                    if (!result.data) {
                        if (result.notFound) {
                            // Definitive 404 — stale ID, clear it silently.
                            setPlaygroundPendingOperationId(null);
                            setPlaygroundResult(null);
                        }
                        // Transient error (5xx, network hiccup) — leave pendingOperationId in
                        // place so reattach retries when the sheet reopens or the next subscribe fires.
                        return;
                    }

                    const operationDetails = result.data;
                    const state = operationDetails.state as string | undefined;
                    const isRunning = state === 'waiting' || state === 'running';
                    const success = !isRunning && state === 'success';

                    const durationMs =
                        operationDetails.durationMs ??
                        (operationDetails.startedAt && operationDetails.endedAt
                            ? new Date(operationDetails.endedAt).getTime() - new Date(operationDetails.startedAt).getTime()
                            : 0);

                    const op = operationDetails;
                    let resultData: unknown = null;
                    if (op.meta || op.request || op.response || op.error) {
                        const pl: Record<string, unknown> = op.meta ? { ...op.meta } : {};
                        if (op.request) pl.request = op.request;
                        if (op.response) pl.response = op.response;
                        if (op.error) {
                            pl.error = { message: op.error.message, ...(op.error.payload ? { payload: op.error.payload } : {}) };
                        }
                        resultData = pl;
                    }

                    if (usePlaygroundStore.getState().pendingOperationId !== pendingOperationId) return;
                    setPlaygroundPendingOperationId(null);
                    setPlaygroundResult({ success, state, data: resultData, durationMs, operationId: pendingOperationId });
                } catch (err) {
                    if (err instanceof Error && err.name === 'AbortError') {
                        // Sheet closed or component unmounted. Leave pendingOperationId in
                        // place so reattach fires again when the sheet reopens.
                    } else {
                        setPlaygroundPendingOperationId(null);
                        setPlaygroundResult({ success: false, data: { error: 'Failed to re-attach to operation' }, durationMs: 0 });
                    }
                } finally {
                    reattachingRef.current = false;
                    usePlaygroundStore.getState().setRunning(false);
                    abortRef.current = null;
                }
            })();
        };

        // Check immediately on mount in case the store already satisfies the condition
        // (e.g. opened with a pendingOperationId already persisted and running=false).
        const initial = usePlaygroundStore.getState();
        if (initial.isOpen && initial.pendingOperationId && !initial.running) {
            startPolling(initial.pendingOperationId, useStore.getState().env);
        }

        // Subscribe to subsequent store changes — handles:
        //   - sheet open with a persisted pendingOperationId (running=false)
        //   - handoff from usePlaygroundRun after it times out (pendingOperationId set,
        //     running stays true — reattachingRef guards against double-start)
        // Note: we check reattachingRef inside startPolling, so it's safe to call on
        // every store update without debouncing.
        const unsubscribe = usePlaygroundStore.subscribe((state) => {
            const { isOpen, pendingOperationId } = state;
            if (!pendingOperationId && reattachingRef.current) {
                abortRef.current?.abort();
            } else if (isOpen && pendingOperationId) {
                startPolling(pendingOperationId, useStore.getState().env);
            }
        });

        return () => {
            unsubscribe();
            abortRef.current?.abort();
        };
    }, []);
}
