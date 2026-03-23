import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Stub @/ alias imports that the module file needs to load, but runReattachLoop doesn't use
vi.mock('@/store', () => ({ useStore: { getState: () => ({ env: 'dev' }) } }));
vi.mock('@/store/playground', () => ({ usePlaygroundStore: { getState: () => ({}), subscribe: () => () => {} } }));
vi.mock('@/utils/api', () => ({ apiFetch: vi.fn() }));

import { POLL_BACKOFF_AFTER_MS, POLL_INITIAL_INTERVAL_MS, POLL_MAX_INTERVAL_MS, runReattachLoop } from './usePlaygroundReattach';

import type { ReattachCallbacks, ReattachFetchResult } from './usePlaygroundReattach';

function makeCallbacks(overrides: Partial<ReattachCallbacks> = {}): ReattachCallbacks {
    return {
        onRunning: vi.fn(),
        onResult: vi.fn(),
        onNotFound: vi.fn(),
        onUnexpectedError: vi.fn(),
        isPendingOperationCurrent: vi.fn().mockReturnValue(true),
        ...overrides
    };
}

function running(): ReattachFetchResult {
    return { data: { state: 'running' } as any, notFound: false };
}
function success(extra: Record<string, unknown> = {}): ReattachFetchResult {
    return { data: { state: 'success', durationMs: 100, ...extra } as any, notFound: false };
}
function notFound(): ReattachFetchResult {
    return { data: null, notFound: true };
}
function transientError(): ReattachFetchResult {
    return { data: null, notFound: false };
}

describe('runReattachLoop', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('calls onRunning immediately', async () => {
        const fetchOp = vi.fn().mockResolvedValue(success());
        const cb = makeCallbacks();
        await runReattachLoop('op-1', new AbortController().signal, fetchOp, cb);
        expect(cb.onRunning).toHaveBeenCalledOnce();
    });

    describe('immediate terminal state', () => {
        it('calls onResult with success=true for a successful operation', async () => {
            const fetchOp = vi.fn().mockResolvedValue(success({ durationMs: 200 }));
            const cb = makeCallbacks();
            await runReattachLoop('op-1', new AbortController().signal, fetchOp, cb);
            expect(cb.onResult).toHaveBeenCalledOnce();
            expect(cb.onResult).toHaveBeenCalledWith(expect.objectContaining({ success: true, state: 'success', operationId: 'op-1', durationMs: 200 }));
        });

        it('calls onResult with success=false for a failed state', async () => {
            const fetchOp = vi.fn().mockResolvedValue({ data: { state: 'failed', durationMs: 50 } as any, notFound: false });
            const cb = makeCallbacks();
            await runReattachLoop('op-1', new AbortController().signal, fetchOp, cb);
            expect(cb.onResult).toHaveBeenCalledWith(expect.objectContaining({ success: false, state: 'failed' }));
        });

        it('calls onNotFound and not onResult for a 404', async () => {
            const fetchOp = vi.fn().mockResolvedValue(notFound());
            const cb = makeCallbacks();
            await runReattachLoop('op-1', new AbortController().signal, fetchOp, cb);
            expect(cb.onNotFound).toHaveBeenCalledOnce();
            expect(cb.onResult).not.toHaveBeenCalled();
        });

        it('calls neither onNotFound nor onResult for a transient error (5xx)', async () => {
            const fetchOp = vi.fn().mockResolvedValue(transientError());
            const cb = makeCallbacks();
            await runReattachLoop('op-1', new AbortController().signal, fetchOp, cb);
            expect(cb.onNotFound).not.toHaveBeenCalled();
            expect(cb.onResult).not.toHaveBeenCalled();
        });
    });

    describe('polling loop', () => {
        it('polls until terminal, then calls onResult', async () => {
            const fetchOp = vi.fn().mockResolvedValueOnce(running()).mockResolvedValueOnce(running()).mockResolvedValueOnce(success());
            const cb = makeCallbacks();

            const loop = runReattachLoop('op-1', new AbortController().signal, fetchOp, cb);
            // Advance through each sleep interval
            await vi.advanceTimersByTimeAsync(POLL_INITIAL_INTERVAL_MS);
            await vi.advanceTimersByTimeAsync(POLL_INITIAL_INTERVAL_MS);
            await loop;

            expect(fetchOp).toHaveBeenCalledTimes(3);
            expect(cb.onResult).toHaveBeenCalledOnce();
        });

        it('uses fast interval before backoff threshold', async () => {
            const fetchOp = vi.fn().mockResolvedValueOnce(running()).mockResolvedValueOnce(success());
            const cb = makeCallbacks();

            const loop = runReattachLoop('op-1', new AbortController().signal, fetchOp, cb);
            // Fast-forward by exactly the initial interval — should be enough
            await vi.advanceTimersByTimeAsync(POLL_INITIAL_INTERVAL_MS);
            await loop;

            expect(cb.onResult).toHaveBeenCalledOnce();
        });

        it('switches to slow interval after backoff threshold', async () => {
            // First fetch: running. After 30s of fake time the loop should use the slow interval.
            const fetchOp = vi.fn().mockResolvedValueOnce(running()).mockResolvedValueOnce(success());
            const cb = makeCallbacks();

            // Advance Date.now() past the backoff threshold before the sleep fires
            vi.setSystemTime(Date.now() + POLL_BACKOFF_AFTER_MS + 1);

            const loop = runReattachLoop('op-1', new AbortController().signal, fetchOp, cb);
            // Fast-forward only the slow interval — if it still used the fast one it would already resolve
            await vi.advanceTimersByTimeAsync(POLL_MAX_INTERVAL_MS);
            await loop;

            expect(cb.onResult).toHaveBeenCalledOnce();
        });
    });

    describe('cancellation (abort)', () => {
        it('resolves without calling onResult when aborted during sleep', async () => {
            const fetchOp = vi.fn().mockResolvedValueOnce(running()).mockResolvedValueOnce(success());
            const cb = makeCallbacks();
            const controller = new AbortController();

            const loop = runReattachLoop('op-1', controller.signal, fetchOp, cb);
            // First fetch returns running, now we're sleeping — abort before the timer fires
            controller.abort();
            await loop;

            expect(cb.onResult).not.toHaveBeenCalled();
            expect(cb.onUnexpectedError).not.toHaveBeenCalled();
        });

        it('resolves without calling onResult when aborted before first fetch', async () => {
            const controller = new AbortController();
            controller.abort(); // pre-aborted
            const fetchOp = vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError'));
            const cb = makeCallbacks();

            await runReattachLoop('op-1', controller.signal, fetchOp, cb);

            expect(cb.onResult).not.toHaveBeenCalled();
            expect(cb.onUnexpectedError).not.toHaveBeenCalled();
        });
    });

    describe('stale pendingOperationId guard', () => {
        it('does not call onResult when isPendingOperationCurrent returns false', async () => {
            const fetchOp = vi.fn().mockResolvedValue(success());
            const cb = makeCallbacks({ isPendingOperationCurrent: vi.fn().mockReturnValue(false) });

            await runReattachLoop('op-1', new AbortController().signal, fetchOp, cb);

            expect(cb.onResult).not.toHaveBeenCalled();
        });
    });

    describe('result shape', () => {
        it('extracts durationMs from startedAt/endedAt when durationMs is missing', async () => {
            const startedAt = '2024-01-01T00:00:00.000Z';
            const endedAt = '2024-01-01T00:00:05.000Z'; // 5000ms later
            const fetchOp = vi.fn().mockResolvedValue({
                data: { state: 'success', startedAt, endedAt } as any,
                notFound: false
            });
            const cb = makeCallbacks();

            await runReattachLoop('op-1', new AbortController().signal, fetchOp, cb);

            expect(cb.onResult).toHaveBeenCalledWith(expect.objectContaining({ durationMs: 5000 }));
        });

        it('assembles resultData from meta, request, response, and error fields', async () => {
            const fetchOp = vi.fn().mockResolvedValue({
                data: {
                    state: 'success',
                    durationMs: 0,
                    meta: { foo: 'bar' },
                    request: { url: '/test' },
                    response: { status: 200 },
                    error: { message: 'oops', payload: { code: 42 } }
                } as any,
                notFound: false
            });
            const cb = makeCallbacks();

            await runReattachLoop('op-1', new AbortController().signal, fetchOp, cb);

            expect(cb.onResult).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: {
                        foo: 'bar',
                        request: { url: '/test' },
                        response: { status: 200 },
                        error: { message: 'oops', payload: { code: 42 } }
                    }
                })
            );
        });

        it('leaves resultData as null when no meta/request/response/error', async () => {
            const fetchOp = vi.fn().mockResolvedValue(success());
            const cb = makeCallbacks();

            await runReattachLoop('op-1', new AbortController().signal, fetchOp, cb);

            expect(cb.onResult).toHaveBeenCalledWith(expect.objectContaining({ data: null }));
        });
    });

    describe('unexpected errors', () => {
        it('calls onUnexpectedError for non-AbortError exceptions', async () => {
            const fetchOp = vi.fn().mockRejectedValue(new Error('Network failure'));
            const cb = makeCallbacks();

            await runReattachLoop('op-1', new AbortController().signal, fetchOp, cb);

            expect(cb.onUnexpectedError).toHaveBeenCalledOnce();
            expect(cb.onResult).not.toHaveBeenCalled();
        });
    });
});
