import { setTimeout } from 'node:timers/promises';

export function cancellableDaemon({
    tick,
    tickIntervalMs,
    onError = () => {}
}: {
    tick: () => Promise<unknown>;
    tickIntervalMs: number;
    onError?: (err: unknown) => void;
}): {
    abort: () => Promise<void>;
} {
    const ac = new AbortController();

    const loop = async (): Promise<void> => {
        if (!Number.isFinite(tickIntervalMs) || tickIntervalMs <= 0) {
            return;
        }
        while (!ac.signal.aborted) {
            try {
                await tick();
            } catch (err) {
                try {
                    onError(err);
                } catch {
                    // swallow errors from the error handler itself
                }
            }
            try {
                await setTimeout(tickIntervalMs, undefined, { signal: ac.signal });
            } catch {
                // AbortError = normal shutdown
            }
        }
    };

    const done = loop();

    return {
        abort: async () => {
            ac.abort();
            return void await done;
        }
    };
}
