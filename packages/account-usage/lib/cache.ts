import { Err, Ok } from '@nangohq/utils';

import type { KVStore } from '@nangohq/kvstore';
import type { Result } from '@nangohq/utils';

export interface UsageCacheEntry {
    key: string;
    count: number;
    revalidateAfter: number;
}

export class UsageCache {
    private store: KVStore;

    constructor(store: KVStore) {
        this.store = store;
    }

    public async incr(key: string, { delta, ttlMs }: { delta: number; ttlMs?: number | undefined }): Promise<Result<UsageCacheEntry>> {
        try {
            const oneHourMs = 60 * 60 * 1000; // TODO: make this configurable?
            const revalidateAfter = Date.now() + oneHourMs + Math.random() * oneHourMs; // default revalidateAfter is between 1 and 2 hours to spread the load

            const count = await this.store.hIncrBy(key, 'count', delta);
            // set revalidateAfter if not exists
            try {
                await this.store.hSet(key, 'revalidateAfter', `${revalidateAfter}`, { canOverride: false });
            } catch {
                // ignore if already exists
            }
            if (ttlMs) {
                await this.store.expires(key, ttlMs);
            }

            const entry = await this.store.hGetAll(key);
            return Ok({
                key,
                count,
                revalidateAfter: parseInt(entry?.['revalidateAfter'] || '0', 10)
            });
        } catch (err) {
            return Err(new Error(`cache_incr_error`, { cause: err }));
        }
    }
}
