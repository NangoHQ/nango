import { setImmediate } from 'node:timers/promises';

import { describe, expect, it, vi } from 'vitest';

import { SchedulerDaemon } from './daemon.js';

import type { Knex } from 'knex';

const ONE_HOUR_MS = 3_600_000;

function createDaemonHarness({
    tick = () => Promise.resolve(),
    tickIntervalMs = ONE_HOUR_MS,
    continueOnError = false,
    onError = vi.fn<(err: Error) => void>()
}: {
    tick?: () => Promise<void>;
    tickIntervalMs?: number;
    continueOnError?: boolean;
    onError?: ReturnType<typeof vi.fn<(err: Error) => void>>;
} = {}) {
    const controller = new AbortController();
    const runTick = vi.fn(tick);

    class TestDaemon extends SchedulerDaemon {
        async run(): Promise<void> {
            await runTick();
        }
    }

    const daemon = new TestDaemon({
        name: 'Test',
        // These tests exercise the loop only; no database operations take place.
        db: {} as Knex,
        tickIntervalMs,
        abortSignal: controller.signal,
        onError,
        continueOnError
    });

    return { daemon, controller, runTick, onError };
}

/** Hold a tick open until the test explicitly finishes or fails it. */
function createControlledTick() {
    let finish!: () => void;
    let fail!: (error: Error) => void;
    const pending = new Promise<void>((resolve, reject) => {
        finish = resolve;
        fail = reject;
    });
    return { run: () => pending, finish, fail };
}

/** Let the loop's promise continuations settle, without advancing or mocking time. */
async function flushDaemonContinuations(): Promise<void> {
    await setImmediate();
}

describe('SchedulerDaemon shutdown', () => {
    // An uninterruptible hourly sleep must fail quickly, rather than hanging the suite.
    it('interrupts an hourly sleep without reporting an error', async () => {
        const { daemon, controller, runTick, onError } = createDaemonHarness();
        const running = daemon.start();

        try {
            await flushDaemonContinuations();
            expect(runTick).toHaveBeenCalledOnce();
        } finally {
            controller.abort();
            await running;
        }

        await daemon.waitUntilStopped();
        expect(runTick).toHaveBeenCalledOnce();
        expect(onError).not.toHaveBeenCalled();
    }, 2000);

    it('lets an in-progress tick finish before stopping', async () => {
        const tick = createControlledTick();
        const { daemon, controller, runTick, onError } = createDaemonHarness({ tick: tick.run });
        const stopped = vi.fn();
        const running = daemon.start().then(stopped);

        try {
            await flushDaemonContinuations();
            expect(runTick).toHaveBeenCalledOnce();

            controller.abort();
            await flushDaemonContinuations();
            expect(stopped).not.toHaveBeenCalled();
        } finally {
            controller.abort();
            tick.finish();
            await running;
        }

        expect(stopped).toHaveBeenCalledOnce();
        expect(runTick).toHaveBeenCalledOnce();
        expect(onError).not.toHaveBeenCalled();
    }, 2000);

    it('does not execute a tick when already aborted before startup', async () => {
        const { daemon, controller, runTick, onError } = createDaemonHarness();
        controller.abort();

        await daemon.start();
        await daemon.waitUntilStopped();

        expect(runTick).not.toHaveBeenCalled();
        expect(onError).not.toHaveBeenCalled();
    });

    it('reports a real tick failure during shutdown without retrying', async () => {
        const tick = createControlledTick();
        const error = new Error('Tick failed during shutdown');
        const { daemon, controller, runTick, onError } = createDaemonHarness({ tick: tick.run, continueOnError: true });
        const running = daemon.start();

        try {
            await flushDaemonContinuations();
            controller.abort();
            // Aborting should suppress the sleep's AbortError, not genuine tick failures.
            tick.fail(error);
            await running;
            await daemon.waitUntilStopped();

            expect(onError).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ cause: error }));
            expect(runTick).toHaveBeenCalledOnce();
        } finally {
            controller.abort();
            tick.finish();
            await running;
        }
    }, 2000);
});
