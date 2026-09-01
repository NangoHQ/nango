import { metrics } from '@nangohq/utils';

const FALLBACK_COOLDOWN_MS = 1000;

/**
 * Per-group cooldowns for webhook dispatch.
 *
 * The rate limit is per environment and the dispatch queue fair queues across groups, so a
 * throttled group is held back on its own. Polling never stops and no other group is slowed
 * down. State is in memory and per process, nothing is coordinated across instances.
 */
export class GroupCooldowns {
    private readonly maxCooldownMs: number;
    private readonly until = new Map<string, number>();

    constructor({ maxCooldownMs }: { maxCooldownMs: number }) {
        this.maxCooldownMs = maxCooldownMs;
    }

    /** Honour the delay the orchestrator suggested. The furthest deadline wins. */
    start(groupKey: string, retryAfterMs: number | null): void {
        const suggested = retryAfterMs !== null && Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? retryAfterMs : FALLBACK_COOLDOWN_MS;
        const cooldownMs = Math.min(Math.ceil(suggested), this.maxCooldownMs);
        if (cooldownMs <= 0) {
            return;
        }

        const now = Date.now();
        this.prune(now);
        const until = Math.max(this.until.get(groupKey) ?? 0, now + cooldownMs);
        this.until.set(groupKey, until);
        metrics.duration(metrics.Types.WEBHOOK_DISPATCH_COOLDOWN_MS, until - now);
    }

    isCoolingDown(groupKey: string): boolean {
        const until = this.until.get(groupKey);
        if (until === undefined) {
            return false;
        }
        if (until <= Date.now()) {
            this.until.delete(groupKey);
            return false;
        }
        return true;
    }

    private prune(now: number): void {
        for (const [key, until] of this.until) {
            if (until <= now) {
                this.until.delete(key);
            }
        }
    }
}
