import { describe, expect, it, vi } from 'vitest';

import { LocalAdaptivePollPacer } from './adaptive-polling.js';

const defaultOptions = {
    maxDelayMs: 500,
    healthyLatencyMs: 100,
    decayWindowMs: 5 * 60 * 1000,
    jitterRatio: 0.2
};

function makePacer(options: Partial<ConstructorParameters<typeof LocalAdaptivePollPacer>[0]> = {}): LocalAdaptivePollPacer {
    return new LocalAdaptivePollPacer({ ...defaultOptions, ...options });
}

describe('LocalAdaptivePollPacer', () => {
    it.each([50, 100])('does not delay polling for latency at or below the healthy threshold: %dms', async (durationMs) => {
        const sleep = vi.fn(() => Promise.resolve());
        const pacer = makePacer({ now: () => 0, random: () => 0.5, sleep });

        pacer.recordSuccess(durationMs);
        await pacer.wait(new AbortController().signal);

        expect(sleep).not.toHaveBeenCalled();
    });

    it('maps unhealthy latency to a sigmoid delay with bounded jitter', async () => {
        const sleep = vi.fn(() => Promise.resolve());
        const pacer = makePacer({ now: () => 0, random: () => 0.5, sleep });

        pacer.recordSuccess(200);
        await pacer.wait(new AbortController().signal);

        expect(sleep).toHaveBeenCalledWith(208, expect.any(AbortSignal));
    });

    it('decays latency pressure to effectively zero over five minutes', async () => {
        let now = 0;
        const sleep = vi.fn(() => Promise.resolve());
        const pacer = makePacer({ now: () => now, random: () => 0.5, sleep });
        pacer.recordSuccess(200);

        now = 5 * 60 * 1000;
        await pacer.wait(new AbortController().signal);
        expect(sleep).toHaveBeenLastCalledWith(3, expect.any(AbortSignal));

        now = 10 * 60 * 1000;
        sleep.mockClear();
        await pacer.wait(new AbortController().signal);
        expect(sleep).not.toHaveBeenCalled();
    });

    it('honors admission Retry-After even when it exceeds the adaptive maximum', async () => {
        const sleep = vi.fn(() => Promise.resolve());
        const pacer = makePacer({ now: () => 0, random: () => 0.5, sleep });

        pacer.recordCongestion(1200, 20);
        await pacer.wait(new AbortController().signal);

        expect(sleep).toHaveBeenCalledWith(1320, expect.any(AbortSignal));
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
        const sleep = vi.fn(async (delayMs: number) => {
            now += delayMs;
            sleepCount += 1;
            if (sleepCount === 1) {
                await firstSleep;
            }
        });
        const pacer = makePacer({ now: () => now, random: () => 0.5, sleep });
        pacer.recordSuccess(200);

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
        const sleep = vi.fn(async (delayMs: number) => {
            now += delayMs;
            await sleeping;
        });
        const pacer = makePacer({ now: () => now, random: () => 1, sleep });
        pacer.recordFailure(20);

        const waitPromise = pacer.wait(new AbortController().signal);
        await vi.waitFor(() => expect(sleep).toHaveBeenCalledOnce());
        pacer.recordCongestion(100, 20);
        now += 200;
        releaseSleep();
        await waitPromise;

        expect(sleep).toHaveBeenCalledOnce();
    });

    it('paces polling after generic orchestrator failures', async () => {
        const sleep = vi.fn(() => Promise.resolve());
        const pacer = makePacer({ now: () => 0, random: () => 1, sleep });

        pacer.recordFailure(20);
        await pacer.wait(new AbortController().signal);

        expect(sleep).toHaveBeenCalledWith(500, expect.any(AbortSignal));
    });

    it('never exceeds the configured adaptive delay for latency pressure', async () => {
        const sleep = vi.fn(() => Promise.resolve());
        const pacer = makePacer({ now: () => 0, random: () => 1, sleep });

        pacer.recordSuccess(10_000);
        await pacer.wait(new AbortController().signal);

        expect(sleep).toHaveBeenCalledWith(500, expect.any(AbortSignal));
    });

    it('aborts an in-progress polling delay during shutdown', async () => {
        const pacer = makePacer({ random: () => 1 });
        pacer.recordFailure(20);
        const controller = new AbortController();

        const waiting = pacer.wait(controller.signal);
        controller.abort();

        await expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('does not apply latency pressure again at the pre-dispatch backoff gate', async () => {
        const sleep = vi.fn(() => Promise.resolve());
        const pacer = makePacer({ now: () => 0, random: () => 1, sleep });
        pacer.recordFailure(20);

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
