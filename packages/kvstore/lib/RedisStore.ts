import type { KVStore } from './KVStore.js';
import type { RedisClientType } from 'redis';

/** Atomically refresh TTL only if the current value still matches (same-owner lock refresh). */
const SET_IF_VALUE_EQUALS_LUA = `
local v = redis.call('GET', KEYS[1])
if v == false then
  return 0
end
if v ~= ARGV[1] then
  return 0
end
redis.call('SET', KEYS[1], ARGV[2], 'PX', tonumber(ARGV[3]))
return 1
`;

const DELETE_IF_VALUE_EQUALS_LUA = `
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
    protected client: RedisClientType;

    constructor(client: RedisClientType) {
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
        const n = await this.client.eval(SET_IF_VALUE_EQUALS_LUA, {
            keys: [key],
            arguments: [expectedValue, newValue, String(ttlMs)]
        });
        return n === 1;
    }

    public async deleteIfValueEquals(key: string, expectedValue: string): Promise<boolean> {
        const n = await this.client.eval(DELETE_IF_VALUE_EQUALS_LUA, {
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
        return count as number;
    }

    public async *scan(pattern: string): AsyncGenerator<string> {
        for await (const key of this.client.scanIterator({
            MATCH: pattern
        })) {
            yield key;
        }
    }
}
