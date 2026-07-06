import type { KVStore } from './KVStore.js';
import type { NangoRedisClient } from './redisClient.js';

/** Atomically refresh TTL only if the current value still matches (same-owner lock refresh). */
const COMPARE_AND_SET = `
local v = redis.call('GET', KEYS[1])
if v ~= ARGV[1] then
  return 0
end
redis.call('SET', KEYS[1], ARGV[2], 'PX', tonumber(ARGV[3]))
return 1
`;

const COMPARE_AND_DELETE = `
local v = redis.call('GET', KEYS[1])
if v == false then
  return 0
end
if v ~= ARGV[1] then
  return 0
end
redis.call('DEL', KEYS[1])
return 1
`;

export class RedisKVStore implements KVStore {
    protected client: NangoRedisClient;

    constructor(client: NangoRedisClient) {
        this.client = client;
    }

    public async destroy(): Promise<void> {
        // Do nothing because the client is shared across other class
    }

    public async get(key: string): Promise<string | null> {
        return this.client.get(key);
    }

    public async set(key: string, value: string, opts?: { canOverride?: boolean; ttlMs?: number }): Promise<void> {
        const options: any = {};
        if (opts) {
            if (opts.ttlMs && opts.ttlMs > 0) {
                options['PX'] = opts.ttlMs;
            }
            if (opts.canOverride === false) {
                options['NX'] = true;
            }
        }
        const res = await this.client.set(key, value, options);
        if (res !== 'OK') {
            throw new Error(`set_key_already_exists`);
        }
    }

    public async setIfValueEquals(key: string, expectedValue: string, newValue: string, ttlMs: number): Promise<boolean> {
        const n = await this.client.eval(COMPARE_AND_SET, {
            keys: [key],
            arguments: [expectedValue, newValue, String(ttlMs)]
        });
        return n === 1;
    }

    public async deleteIfValueEquals(key: string, expectedValue: string): Promise<boolean> {
        const n = await this.client.eval(COMPARE_AND_DELETE, {
            keys: [key],
            arguments: [expectedValue]
        });
        return n === 1;
    }

    public async exists(key: string): Promise<boolean> {
        return (await this.client.exists(key)) > 0;
    }

    public async delete(key: string): Promise<void> {
        await this.client.del(key);
    }

    public async incr(key: string, opts?: { ttlMs?: number; delta?: number }): Promise<number> {
        const multi = this.client.multi();
        multi.incrBy(key, opts?.delta || 1);
        if (opts?.ttlMs) {
            multi.pExpire(key, opts.ttlMs);
        }
        const [count] = await multi.exec();
        return Number(count);
    }

    public async sAdd(key: string, member: string, opts?: { ttlMs?: number }): Promise<void> {
        if (opts?.ttlMs && opts.ttlMs > 0) {
            const multi = this.client.multi();
            multi.sAdd(key, member);
            // Extend-only TTL:
            // - NX seeds the freshly added set,
            // - GT only ever lengthens it, so the set outlives its longest-lived member
            multi.pExpire(key, opts.ttlMs, 'NX');
            multi.pExpire(key, opts.ttlMs, 'GT');
            await multi.exec();
            return;
        }
        await this.client.sAdd(key, member);
    }

    public async sMembers(key: string): Promise<string[]> {
        return this.client.sMembers(key);
    }
}
