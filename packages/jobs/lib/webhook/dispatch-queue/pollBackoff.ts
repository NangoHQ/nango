import { metrics } from '@nangohq/utils';

// Used when the orchestrator throttles us without a usable delay, so we never spin.
const FALLBACK_DELAY_MS = 1000;

/**
 * Shared pause between webhook dispatch polls.
 *
 * Every poll loop in the process reads the same deadline, so a rate limit hit by one loop
 * stops the others from polling straight back into it. Nothing is coordinated across
 * instances and no message is held while we wait.
 */
export class PollBackoff {
    private readonly maxDelayMs: number;
    private until = 0;

    constructor({ maxDelayMs }: { maxDelayMs: number }) {
        this.maxDelayMs = maxDelayMs;
    }

    /**
     * Honour the delay the orchestrator suggested, clamped to `maxDelayMs`.
     * The furthest deadline wins so a longer delay is never shortened by a later, smaller one.
     */
    delayPolling(retryAfterMs: number | null): void {
        const suggested = retryAfterMs !== null && Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? retryAfterMs : FALLBACK_DELAY_MS;
        const delayMs = Math.min(Math.ceil(suggested), this.maxDelayMs);
        if (delayMs <= 0) {
            return;
        }
        this.until = Math.max(this.until, Date.now() + delayMs);
    }

    remainingMs(): number {
        return Math.max(0, this.until - Date.now());
    }

    async wait(signal: AbortSignal): Promise<void> {
        if (this.remainingMs() <= 0) {
            return;
        }

        const startedAt = Date.now();
        // The deadline can be pushed further out by another loop while we are asleep.
        while (!signal.aborted) {
            const remainingMs = this.remainingMs();
            if (remainingMs <= 0) {
                break;
            }
            await sleep(remainingMs, signal);
        }
        metrics.duration(metrics.Types.WEBHOOK_DISPATCH_BACKOFF_MS, Date.now() - startedAt);
    }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
        const done = () => {
            clearTimeout(timer);
            signal.removeEventListener('abort', done);
            resolve();
        };
        const timer = setTimeout(done, ms);
        signal.addEventListener('abort', done, { once: true });
    });
}
