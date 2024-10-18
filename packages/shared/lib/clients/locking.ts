import { getRedisUrl } from '../utils/utils.js';
import { Locking } from '../utils/lock/locking.js';
import type { KVStore } from '../utils/kvstore/KVStore.js';
import { RedisKVStore } from '../utils/kvstore/RedisStore.js';
import { InMemoryKVStore } from '../utils/kvstore/InMemoryStore.js';

export const locking = await (async () => {
    let store: KVStore;
    const url = getRedisUrl();
    if (url) {
        store = new RedisKVStore(url);
        await (store as RedisKVStore).connect();
    } else {
        store = new InMemoryKVStore();
    }
    return new Locking(store);
})();
