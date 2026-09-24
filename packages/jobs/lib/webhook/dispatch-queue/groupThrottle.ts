import { metrics, TTLFixedSizeMap } from '@nangohq/utils';

const FALLBACK_THROTTLE_MS = 1000;
const MAX_TRACKED_GROUPS = 10_000;

export class GroupThrottles {
    private readonly maxThrottleMs: number;
    private readonly throttledGroups: TTLFixedSizeMap<string, true>;

    constructor({ maxThrottleMs }: { maxThrottleMs: number }) {
        if (!Number.isFinite(maxThrottleMs) || maxThrottleMs < 0) {
            throw new RangeError('maxThrottleMs must be a finite, non-negative number');
        }
        this.maxThrottleMs = Math.ceil(maxThrottleMs);
        this.throttledGroups = new TTLFixedSizeMap(MAX_TRACKED_GROUPS, this.maxThrottleMs);
    }

    throttleFor(groupKey: string, retryAfterMs: number | null): void {
        const suggested = retryAfterMs !== null && Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? retryAfterMs : FALLBACK_THROTTLE_MS;
        const throttleMs = Math.min(Math.ceil(suggested), this.maxThrottleMs);
        if (throttleMs <= 0) {
            return;
        }

        // A shorter delay never cuts a throttle that is already running for longer.
        const ttlMs = Math.max(this.throttledGroups.remainingMs(groupKey), throttleMs);
        this.throttledGroups.set(groupKey, true, ttlMs);
        metrics.duration(metrics.Types.WEBHOOK_DISPATCH_THROTTLE_MS, ttlMs);
    }

    isThrottled(groupKey: string): boolean {
        return this.throttledGroups.get(groupKey) !== undefined;
    }

    remainingMs(groupKey: string): number {
        return this.throttledGroups.remainingMs(groupKey);
    }
}
