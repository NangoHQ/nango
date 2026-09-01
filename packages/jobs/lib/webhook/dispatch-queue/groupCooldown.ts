import { metrics, TTLFixedSizeMap } from '@nangohq/utils';

const FALLBACK_COOLDOWN_MS = 1000;
const MAX_TRACKED_GROUPS = 10_000;
const NANOSECONDS_PER_MILLISECOND = 1_000_000n;

export class GroupCooldowns {
    private readonly maxCooldownMs: number;
    private readonly throttledGroups: TTLFixedSizeMap<string, bigint>;

    constructor({ maxCooldownMs }: { maxCooldownMs: number }) {
        if (!Number.isFinite(maxCooldownMs) || maxCooldownMs < 0) {
            throw new RangeError('maxCooldownMs must be a finite, non-negative number');
        }
        this.maxCooldownMs = Math.ceil(maxCooldownMs);
        this.throttledGroups = new TTLFixedSizeMap(MAX_TRACKED_GROUPS, this.maxCooldownMs);
    }

    start(groupKey: string, retryAfterMs: number | null): void {
        const suggested = retryAfterMs !== null && Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? retryAfterMs : FALLBACK_COOLDOWN_MS;
        const cooldownMs = Math.min(Math.ceil(suggested), this.maxCooldownMs);
        if (cooldownMs <= 0) {
            return;
        }

        const now = process.hrtime.bigint();
        const proposedUntil = now + BigInt(cooldownMs) * NANOSECONDS_PER_MILLISECOND;
        const previousUntil = this.throttledGroups.get(groupKey) ?? 0n;
        const until = previousUntil > proposedUntil ? previousUntil : proposedUntil;
        this.throttledGroups.set(groupKey, until);
        metrics.duration(metrics.Types.WEBHOOK_DISPATCH_COOLDOWN_MS, Number(until - now) / Number(NANOSECONDS_PER_MILLISECOND));
    }

    isCoolingDown(groupKey: string): boolean {
        return this.remainingMs(groupKey) > 0;
    }

    remainingMs(groupKey: string): number {
        const until = this.throttledGroups.get(groupKey);
        if (until === undefined) {
            return 0;
        }
        const remaining = until - process.hrtime.bigint();
        return remaining > 0n ? Number(remaining / NANOSECONDS_PER_MILLISECOND) : 0;
    }
}
