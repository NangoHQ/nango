import { setTimeout } from 'node:timers/promises';

export function cancellableDaemon<T>({ tick, tickIntervalMs }: { tick: () => Promise<T>; tickIntervalMs: number }): {
    abort: () => Promise<T | void>;
} {
    const ac = new AbortController();
    const loop = async (): Promise<void> => {
        if (tickIntervalMs <= 0) {
            return;
        }
        while (true) {
            if (ac.signal.aborted) {
                return;
            }
            tick();
            await setTimeout(tickIntervalMs);
        }
    };
    const done = loop();

    const abort = async () => {
        ac.abort();
        return await done;
    };

    return { abort };
}
