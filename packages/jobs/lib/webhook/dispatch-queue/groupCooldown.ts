import { metrics } from '@nangohq/utils';

const FALLBACK_COOLDOWN_MS = 1000;

export class GroupCooldowns {
    private readonly maxCooldownMs: number;
    private readonly throttledGroups = new Map<string, number>();

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
        const until = Math.max(this.throttledGroups.get(groupKey) ?? 0, now + cooldownMs);
        this.throttledGroups.set(groupKey, until);
        metrics.duration(metrics.Types.WEBHOOK_DISPATCH_COOLDOWN_MS, cooldownMs);
    }

    isCoolingDown(groupKey: string): boolean {
        const until = this.throttledGroups.get(groupKey);
        if (until === undefined) {
            return false;
        }
        if (until <= Date.now()) {
            this.throttledGroups.delete(groupKey);
            return false;
        }
        return true;
    }

    private prune(now: number): void {
        for (const [key, until] of this.throttledGroups) {
            if (until <= now) {
                this.throttledGroups.delete(key);
            }
        }
    }
}
