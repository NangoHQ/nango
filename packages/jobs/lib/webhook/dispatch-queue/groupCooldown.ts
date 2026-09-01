import { metrics } from '@nangohq/utils';

const FALLBACK_COOLDOWN_MS = 1000;

/** In memory and per process. Nothing here is coordinated across instances. */
export class GroupCooldowns {
    private readonly maxCooldownMs: number;
    private readonly until = new Map<string, number>();

    constructor({ maxCooldownMs }: { maxCooldownMs: number }) {
        this.maxCooldownMs = maxCooldownMs;
    }

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
