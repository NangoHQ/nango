import { RedisKVStore } from './kvstore/RedisStore.js';
import { getRedisUrl } from './utils.js';

class FeatureFlags {
    redis: RedisKVStore | undefined;

    constructor(redis: RedisKVStore | undefined) {
        try {
            this.redis = redis;
        } catch (e) {
            console.log('Feature flags not enabled');
        }
    }

    async isEnabled(key: string, distinctId: string, fallback: boolean, isExcludingFlag: boolean = false): Promise<boolean> {
        if (!this.redis) {
            return fallback;
        }
        return this.redis.exists(`flag:${key}:${distinctId}`).then(
            (r) => {
                return isExcludingFlag ? !r : r;
            },
            (_) => {
                return fallback;
            }
        );
    }
}

const redis = await (async () => {
    let redis: RedisKVStore | undefined;
    const url = getRedisUrl();
    if (url) {
        redis = new RedisKVStore(url);
        await redis.connect();
    }
    return redis;
})();
export default new FeatureFlags(redis);
