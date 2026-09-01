import { metrics } from '@nangohq/utils';

const FALLBACK_COOLDOWN_MS = 1000;

export class GroupCooldowns {
    private readonly maxCooldownMs: number;
    private readonly throttledGroups = new Map<string, number>();

    constructor({ maxCooldownMs }: { maxCooldownMs: number }) {
        if (!Number.isFinite(maxCooldownMs) || maxCooldownMs < 0) {
            throw new RangeError('maxCooldownMs must be a finite, non-negative number');
        }
        this.maxCooldownMs = Math.ceil(maxCooldownMs);
    }

    start(groupKey: string, retryAfterMs: number | null): void {
        const suggested = retryAfterMs !== null && Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? retryAfterMs : FALLBACK_COOLDOWN_MS;
        const cooldownMs = Math.min(Math.ceil(suggested), this.maxCooldownMs);
        if (cooldownMs <= 0) {
            return;
        }

        const now = Date.now();
        const previousUntil = this.throttledGroups.get(groupKey) ?? 0;
        const until = Math.max(previousUntil, now + cooldownMs);
        if (until !== previousUntil) {
            this.throttledGroups.set(groupKey, until);
            const timer = setTimeout(() => {
                if (this.throttledGroups.get(groupKey) === until) {
                    this.throttledGroups.delete(groupKey);
                }
            }, until - now);
            timer.unref();
        }
        metrics.duration(metrics.Types.WEBHOOK_DISPATCH_COOLDOWN_MS, until - now);
    }

    isCoolingDown(groupKey: string): boolean {
        const until = this.throttledGroups.get(groupKey);
        return until !== undefined && until > Date.now();
    }
}
