import { useEffect, useRef } from 'react';

import { useStore } from '@/store';
import { apiFetch } from '@/utils/api';

import type { GetOperation } from '@nangohq/types';

/**
 * When the playground opens and a pendingOperationId is stored, re-attaches to
 * that operation and polls until it's terminal. Sets running=true during the
 * wait so the UI shows the running state just as if the run were live.
 *
 * Called lazily — only activates when the sheet is open.
 */
export function usePlaygroundReattach() {
    const env = useStore((s) => s.env);
    const playgroundOpen = useStore((s) => s.playground.isOpen);
    const pendingOperationId = useStore((s) => s.playground.pendingOperationId);
    const setPlaygroundResult = useStore((s) => s.setPlaygroundResult);
    const setPlaygroundPendingOperationId = useStore((s) => s.setPlaygroundPendingOperationId);
    const setPlaygroundRunning = useStore((s) => s.setPlaygroundRunning);

    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        // Only activate when the sheet is open and there's a pending operation.
        if (!playgroundOpen || !pendingOperationId) return;

        const controller = new AbortController();
        abortRef.current = controller;

        setPlaygroundRunning(true);

        const fetchOperation = async (operationId: string) => {
            const res = await apiFetch(`/api/v1/logs/operations/${encodeURIComponent(operationId)}?env=${env}`, {
                method: 'GET',
                signal: controller.signal
            });
            if (!res.ok) return null;
            const json = (await res.json()) as GetOperation['Success'];
            return json.data;
        };

        const sleep = (ms: number) =>
            new Promise<void>((resolve, reject) => {
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

        void (async () => {
            try {
                let operationDetails = await fetchOperation(pendingOperationId);

                // Poll until terminal or we give up (5 min max — long running syncs).
                const maxPollMs = 5 * 60_000;
                const pollStart = Date.now();
                while (operationDetails && (operationDetails.state === 'waiting' || operationDetails.state === 'running')) {
                    if (Date.now() - pollStart > maxPollMs) break;
                    await sleep(1500);
                    operationDetails = await fetchOperation(pendingOperationId);
                }

                if (!operationDetails) {
                    // Operation not found — stale ID, clear it silently.
                    setPlaygroundPendingOperationId(null);
                    setPlaygroundResult(null);
                    return;
                }

                const state = operationDetails.state as string | undefined;
                const isRunning = state === 'waiting' || state === 'running';
                const success = !isRunning && state === 'success';

                const durationMs =
                    operationDetails.durationMs ??
                    (operationDetails.startedAt && operationDetails.endedAt
                        ? new Date(operationDetails.endedAt).getTime() - new Date(operationDetails.startedAt).getTime()
                        : 0);

                // Mirror the payload assembly from Logs/Operation/Show.tsx
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

                setPlaygroundPendingOperationId(null);
                setPlaygroundResult({ success, state, data: resultData, durationMs, operationId: pendingOperationId });
            } catch (err) {
                if (err instanceof Error && err.name === 'AbortError') {
                    // Sheet closed or env changed — leave pendingOperationId in place so
                    // it can re-attach next time the sheet opens.
                } else {
                    setPlaygroundPendingOperationId(null);
                    setPlaygroundResult({ success: false, data: { error: 'Failed to re-attach to operation' }, durationMs: 0 });
                }
            } finally {
                setPlaygroundRunning(false);
                abortRef.current = null;
            }
        })();

        return () => {
            controller.abort();
        };
        // Re-run only when the sheet opens or a new pendingOperationId appears.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playgroundOpen, pendingOperationId]);
}
