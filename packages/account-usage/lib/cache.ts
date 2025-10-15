import * as z from 'zod';

import { Err, Ok } from '@nangohq/utils';

import type { getRedis } from '@nangohq/kvstore';
import type { Result } from '@nangohq/utils';

const UsageCacheEntrySchema = z.object({
    key: z.string(),
    count: z.coerce.number(),
    revalidateAfter: z.coerce.number().min(0)
});
const UsageCacheEntryValueSchema = UsageCacheEntrySchema.omit({ key: true });
type UsageCacheEntry = z.infer<typeof UsageCacheEntrySchema>;

type Redis = Awaited<ReturnType<typeof getRedis>>;

export class UsageCache {
    constructor(private store: Redis) {}

    public async get(key: string): Promise<Result<UsageCacheEntry | null>> {
        try {
            const res = await this.store.multi().hGetAll(key).exec();
            if (!res || res.length === 0 || !res[0]) {
                return Ok(null);
            }
            const [data] = res;
            if (!data || Object.keys(data).length === 0) {
                return Ok(null);
            }
            return await this.validateEntry(key, data);
        } catch (err) {
            return Err(new Error(`cache_get_error`, { cause: err }));
        }
    }

    public async incr(key: string, { delta, ttlMs }: { delta: number; ttlMs?: number | undefined }): Promise<Result<UsageCacheEntry>> {
        try {
            const oneHourMs = 60 * 60 * 1000; // TODO: make this configurable?
            const revalidateAfter = Date.now() + oneHourMs + Math.random() * oneHourMs; // default revalidateAfter is between 1 and 2 hours to spread the load

            const multi = this.store.multi();
            multi.hIncrBy(key, 'count', delta);
            multi.hSetNX(key, 'revalidateAfter', `${revalidateAfter}`);
            if (ttlMs) {
                multi.pExpire(key, ttlMs);
            }
            multi.hGetAll(key);
            const res = await multi.exec();
            if (!res || res.length === 0) {
                return Err(new Error('cache_incr_error'));
            }
            return await this.validateEntry(key, res.at(-1));
        } catch (err) {
            return Err(new Error(`cache_incr_error`, { cause: err }));
        }
    }

    private async validateEntry(key: string, data: any): Promise<Result<UsageCacheEntry>> {
        if (!data) {
            return Err(new Error(`cache_entry_invalid`));
        }
        const validated = UsageCacheEntryValueSchema.safeParse(data);
        if (!validated.success) {
            // if the data is invalid, we delete the key to avoid returning invalid data again
            await this.store.del(key);
            return Err(new Error(`cache_entry_invalid`));
        }
        return Ok({
            key,
            ...validated.data
        });
    }
}
