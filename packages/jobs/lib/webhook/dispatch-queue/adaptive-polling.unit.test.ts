import { describe, expect, it, vi } from 'vitest';

import { LocalAdaptivePollPacer } from './adaptive-polling.js';

const defaultOptions = {
    maxDelayMs: 500,
    healthyLatencyMs: 100,
    latencyTauMs: 10_000,
    failureBackoffMs: 500,
    jitterRatio: 0.2
};

function makePacer(options: Partial<ConstructorParameters<typeof LocalAdaptivePollPacer>[0]> = {}): LocalAdaptivePollPacer {
    return new LocalAdaptivePollPacer({ ...defaultOptions, ...options });
}

describe('LocalAdaptivePollPacer', () => {
    it.each([50, 100])('does not delay polling for latency at or below the healthy threshold: %dms', async (durationMs) => {
        let now = 0;
        const sleep = vi.fn(() => Promise.resolve());
        const pacer = makePacer({ now: () => now, random: () => 0.5, sleep });

        now = 1000;
        pacer.recordSuccess(durationMs);
        await pacer.wait(new AbortController().signal);

        expect(sleep).not.toHaveBeenCalled();
    });

    it('smooths a single transient latency spike', async () => {
        let now = 0;
        const sleep = vi.fn(() => Promise.resolve());
        const pacer = makePacer({ now: () => now, random: () => 0.5, sleep });

        now = 1000;
        pacer.recordSuccess(1000);
        await pacer.wait(new AbortController().signal);

        expect(sleep).toHaveBeenCalledWith(43, expect.any(AbortSignal));
    });

    it.each([
        [5, 178],
        [10, 285],
        [30, 428]
    ])('reacts to sustained unhealthy latency over %ds', async (durationSeconds, expectedDelayMs) => {
        let now = 0;
        const sleep = vi.fn(() => Promise.resolve());
        const pacer = makePacer({ now: () => now, random: () => 0.5, sleep });

        for (let second = 1; second <= durationSeconds; second++) {
            now = second * 1000;
            pacer.recordSuccess(1000);
        }
        await pacer.wait(new AbortController().signal);

        expect(sleep).toHaveBeenCalledWith(expectedDelayMs, expect.any(AbortSignal));
    });

    it('recovers as healthy latency samples replace sustained pressure', async () => {
        let now = 0;
        const sleep = vi.fn(() => Promise.resolve());
        const pacer = makePacer({ now: () => now, random: () => 0.5, sleep });

        for (let second = 1; second <= 10; second++) {
            now = second * 1000;
            pacer.recordSuccess(1000);
        }
        for (let second = 11; second <= 20; second++) {
            now = second * 1000;
            pacer.recordSuccess(50);
        }
        await pacer.wait(new AbortController().signal);

        expect(sleep).toHaveBeenCalledWith(105, expect.any(AbortSignal));
    });

    it('responds consistently over wall-clock time at different sample frequencies', async () => {
        let slowNow = 0;
        let fastNow = 0;
        const slowSleep = vi.fn(() => Promise.resolve());
        const fastSleep = vi.fn(() => Promise.resolve());
        const slowPacer = makePacer({ now: () => slowNow, random: () => 0.5, sleep: slowSleep });
        const fastPacer = makePacer({ now: () => fastNow, random: () => 0.5, sleep: fastSleep });

        for (let sample = 1; sample <= 10; sample++) {
            slowNow = sample * 1000;
            slowPacer.recordSuccess(1000);
        }
        for (let sample = 1; sample <= 100; sample++) {
            fastNow = sample * 100;
            fastPacer.recordSuccess(1000);
        }
        await slowPacer.wait(new AbortController().signal);
        await fastPacer.wait(new AbortController().signal);

        expect(slowSleep).toHaveBeenCalledWith(285, expect.any(AbortSignal));
        expect(fastSleep).toHaveBeenCalledWith(285, expect.any(AbortSignal));
    });

    it('isolates a transient spike to the jobs pod that observed it', async () => {
        let now = 0;
        const sleeps = Array.from({ length: 10 }, () => vi.fn(() => Promise.resolve()));
        const pacers = sleeps.map((sleep) => makePacer({ now: () => now, random: () => 0.5, sleep }));

        now = 1000;
        const affectedPacer = pacers[0];
        if (!affectedPacer) {
            throw new Error('Expected an affected jobs pod');
        }
        affectedPacer.recordSuccess(1000);
        await Promise.all(pacers.map(async (pacer) => await pacer.wait(new AbortController().signal)));

        expect(sleeps[0]).toHaveBeenCalledWith(43, expect.any(AbortSignal));
        expect(sleeps.slice(1).every((sleep) => sleep.mock.calls.length === 0)).toBe(true);
    });

    it('honors admission Retry-After even when it exceeds the adaptive maximum', async () => {
        const sleep = vi.fn(() => Promise.resolve());
        const pacer = makePacer({ now: () => 0, random: () => 0.5, sleep });

        pacer.recordCongestion(1200, 20);
        await pacer.wait(new AbortController().signal);

        expect(sleep).toHaveBeenCalledWith(1320, expect.any(AbortSignal));
    });

    it('does not replace latency pressure with admission congestion', async () => {
        let now = 0;
        const sleep = vi.fn(() => Promise.resolve());
        const pacer = makePacer({ now: () => now, random: () => 1, sleep });

        now = 1000;
        pacer.recordSuccess(1000);
        pacer.recordCongestion(100, 20);
        now = 1101;
        await pacer.wait(new AbortController().signal);

        expect(sleep).toHaveBeenCalledWith(48, expect.any(AbortSignal));
    });

    it('honors admission Retry-After at the pre-dispatch gate', async () => {
        const sleep = vi.fn(() => Promise.resolve());
        const prepareWait = vi.fn(() => Promise.resolve());
        const pacer = makePacer({ now: () => 0, random: () => 0.5, sleep });

        pacer.recordCongestion(1200, 20);
        await pacer.waitForBackoff(new AbortController().signal, prepareWait);

        expect(prepareWait).toHaveBeenCalledWith(1320, expect.any(AbortSignal));
        expect(sleep).toHaveBeenCalledWith(1320, expect.any(AbortSignal));
        const prepareOrder = prepareWait.mock.invocationCallOrder[0];
        const sleepOrder = sleep.mock.invocationCallOrder[0];
        if (prepareOrder === undefined || sleepOrder === undefined) {
            throw new Error('Expected visibility preparation and sleep to be called');
        }
        expect(prepareOrder).toBeLessThan(sleepOrder);
    });

    it('extends an existing admission backoff', async () => {
        let now = 0;
        const sleep = vi.fn(() => Promise.resolve());
        const pacer = makePacer({ now: () => now, random: () => 0.5, sleep });
        pacer.recordCongestion(1200, 20);

        now = 400;
        pacer.recordCongestion(2000, 20);
        await pacer.wait(new AbortController().signal);

        expect(sleep).toHaveBeenCalledWith(2200, expect.any(AbortSignal));
    });

    it('rechecks a Retry-After deadline extended by another poll loop', async () => {
        let now = 0;
        let sleepCount = 0;
        let releaseFirstSleep!: () => void;
        const firstSleep = new Promise<void>((resolve) => {
            releaseFirstSleep = resolve;
        });
        const sleep = vi.fn(async (_delayMs: number) => {
            sleepCount += 1;
            if (sleepCount === 1) {
                await firstSleep;
            }
        });
        const pacer = makePacer({ now: () => now, random: () => 0.5, sleep });
        pacer.recordCongestion(500, 20);

        const waitPromise = pacer.wait(new AbortController().signal);
        await vi.waitFor(() => expect(sleep).toHaveBeenCalledOnce());
        pacer.recordCongestion(1200, 20);
        releaseFirstSleep();
        await waitPromise;

        expect(sleep).toHaveBeenCalledTimes(2);
        expect(sleep.mock.calls[1]?.[0]).toBe(1320);
    });

    it('does not wait again when an extended deadline expires during the current sleep', async () => {
        let now = 0;
        let releaseSleep!: () => void;
        const sleeping = new Promise<void>((resolve) => {
            releaseSleep = resolve;
        });
        const sleep = vi.fn(async () => {
            await sleeping;
        });
        const pacer = makePacer({ now: () => now, random: () => 1, sleep });
        pacer.recordCongestion(100, 20);

        const waitPromise = pacer.wait(new AbortController().signal);
        await vi.waitFor(() => expect(sleep).toHaveBeenCalledOnce());
        pacer.recordCongestion(200, 20);
        now = 300;
        releaseSleep();
        await waitPromise;

        expect(sleep).toHaveBeenCalledOnce();
    });

    it('applies the configured fixed backoff after generic failures', async () => {
        const sleep = vi.fn(() => Promise.resolve());
        const pacer = makePacer({ now: () => 0, random: () => 1, sleep });

        pacer.recordFailure(20);
        await pacer.wait(new AbortController().signal);

        expect(sleep).toHaveBeenCalledWith(500, expect.any(AbortSignal));
    });

    it('allows disabling generic failure backoff', async () => {
        const sleep = vi.fn(() => Promise.resolve());
        const pacer = makePacer({ failureBackoffMs: 0, now: () => 0, random: () => 1, sleep });

        pacer.recordFailure(20);
        await pacer.wait(new AbortController().signal);

        expect(sleep).not.toHaveBeenCalled();
    });

    it('uses the longer of admission and generic failure backoffs', async () => {
        const sleep = vi.fn(() => Promise.resolve());
        const pacer = makePacer({ now: () => 0, random: () => 0.5, sleep });

        pacer.recordFailure(20);
        pacer.recordCongestion(1200, 20);
        await pacer.wait(new AbortController().signal);

        expect(sleep).toHaveBeenCalledWith(1320, expect.any(AbortSignal));
    });

    it('never exceeds the configured adaptive delay for latency pressure', async () => {
        let now = 0;
        const sleep = vi.fn(() => Promise.resolve());
        const pacer = makePacer({ now: () => now, random: () => 1, sleep });

        now = 100_000;
        pacer.recordSuccess(10_000);
        await pacer.wait(new AbortController().signal);

        expect(sleep).toHaveBeenCalledWith(500, expect.any(AbortSignal));
    });

    it('aborts an in-progress failure backoff during shutdown', async () => {
        const pacer = makePacer({ random: () => 1 });
        pacer.recordFailure(20);
        const controller = new AbortController();

        const waiting = pacer.wait(controller.signal);
        controller.abort();

        await expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('does not apply latency pressure again at the pre-dispatch backoff gate', async () => {
        let now = 0;
        const sleep = vi.fn(() => Promise.resolve());
        const pacer = makePacer({ now: () => now, random: () => 1, sleep });

        now = 1000;
        pacer.recordSuccess(1000);
        await pacer.waitForBackoff(new AbortController().signal, () => Promise.resolve());

        expect(sleep).not.toHaveBeenCalled();
    });

    it('does not prepare a pre-dispatch wait after shutdown starts', async () => {
        const prepareWait = vi.fn(() => Promise.resolve());
        const pacer = makePacer({ now: () => 0, random: () => 1 });
        const controller = new AbortController();
        pacer.recordCongestion(1000, 20);
        controller.abort();

        await expect(pacer.waitForBackoff(controller.signal, prepareWait)).rejects.toMatchObject({ name: 'AbortError' });

        expect(prepareWait).not.toHaveBeenCalled();
    });
});
