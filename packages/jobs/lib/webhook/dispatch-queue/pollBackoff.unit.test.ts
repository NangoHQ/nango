import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PollBackoff } from './pollBackoff.js';

describe('PollBackoff', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('waits for the suggested delay', async () => {
        const backoff = new PollBackoff({ maxDelayMs: 60_000 });
        backoff.delayPolling(5_000);
        expect(backoff.remainingMs()).toBe(5_000);

        const waiting = backoff.wait(new AbortController().signal);
        await vi.advanceTimersByTimeAsync(4_999);
        expect(backoff.remainingMs()).toBe(1);

        await vi.advanceTimersByTimeAsync(1);
        await waiting;
        expect(backoff.remainingMs()).toBe(0);
    });

    it('clamps the suggested delay to the maximum', () => {
        const backoff = new PollBackoff({ maxDelayMs: 10_000 });
        backoff.delayPolling(90_000);
        expect(backoff.remainingMs()).toBe(10_000);
    });

    it('falls back to a delay when the orchestrator sends none', () => {
        const backoff = new PollBackoff({ maxDelayMs: 60_000 });
        backoff.delayPolling(null);
        expect(backoff.remainingMs()).toBe(1_000);
    });

    it('keeps the furthest deadline', () => {
        const backoff = new PollBackoff({ maxDelayMs: 60_000 });
        backoff.delayPolling(5_000);
        backoff.delayPolling(1_000);
        expect(backoff.remainingMs()).toBe(5_000);
    });

    it('waits again when another loop pushes the deadline out mid-wait', async () => {
        const backoff = new PollBackoff({ maxDelayMs: 60_000 });
        backoff.delayPolling(1_000);
        const waiting = backoff.wait(new AbortController().signal);

        await vi.advanceTimersByTimeAsync(500);
        backoff.delayPolling(2_000);

        // The new deadline is 2s from when it was set, so 1.5s is left when the first sleep ends.
        await vi.advanceTimersByTimeAsync(500);
        expect(backoff.remainingMs()).toBe(1_500);

        await vi.advanceTimersByTimeAsync(1_500);
        await waiting;
        expect(backoff.remainingMs()).toBe(0);
    });

    it('returns immediately on abort', async () => {
        const backoff = new PollBackoff({ maxDelayMs: 60_000 });
        backoff.delayPolling(60_000);
        const abortController = new AbortController();

        const waiting = backoff.wait(abortController.signal);
        abortController.abort();
        await waiting;

        // The deadline is untouched, the shutdown just stops waiting on it.
        expect(backoff.remainingMs()).toBe(60_000);
    });

    it('does nothing when it was never delayed', async () => {
        const backoff = new PollBackoff({ maxDelayMs: 60_000 });
        expect(backoff.remainingMs()).toBe(0);
        await backoff.wait(new AbortController().signal);
    });
});
