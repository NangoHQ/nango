import { stringifyError } from '@nangohq/utils';

import { logger } from './utils.js';

import type { Result } from '@nangohq/utils';

const DEFAULT_REFRESH_INTERVAL_MS = 30_000;

/**
 * Per-group rate limit overrides, cached so admission does not query the database on every request.
 * A rate limit key doubles as the `group_overrides.group_key` its override is read from, which is why
 * webhook dispatch sends its group key as the rate limit key.
 */
export class RateLimitOverrides {
    private readonly load: () => Promise<Result<Map<string, number>>>;
    private readonly refreshIntervalMs: number;
    private overrides = new Map<string, number>();
    private nextRefreshAt = 0;
    private refreshing: Promise<void> | undefined;

    constructor({ load, refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS }: { load: () => Promise<Result<Map<string, number>>>; refreshIntervalMs?: number }) {
        this.load = load;
        this.refreshIntervalMs = refreshIntervalMs;
    }

    /**
     * Override for a rate limit key, or undefined to fall back to the global default.
     */
    public async get(rateLimitKey: string): Promise<number | undefined> {
        await this.refreshIfStale();
        return this.overrides.get(rateLimitKey);
    }

    private async refreshIfStale(): Promise<void> {
        if (Date.now() < this.nextRefreshAt) {
            return;
        }
        this.refreshing ??= this.refresh().finally(() => {
            this.refreshing = undefined;
        });
        await this.refreshing;
    }

    private async refresh(): Promise<void> {
        // Back off on failure too, so a broken query keeps serving the last snapshot instead of hammering the database
        this.nextRefreshAt = Date.now() + this.refreshIntervalMs;
        try {
            const res = await this.load();
            if (res.isErr()) {
                logger.error(`Failed to load rate limit overrides: ${stringifyError(res.error)}`);
                return;
            }
            this.overrides = res.value;
        } catch (err) {
            logger.error(`Failed to load rate limit overrides: ${stringifyError(err)}`);
        }
    }
}
