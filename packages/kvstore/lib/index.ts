import { InMemoryKVStore } from './InMemoryStore.js';
import { RedisKVStore } from './RedisStore.js';

export { InMemoryKVStore } from './InMemoryStore.js';
export { RedisKVStore } from './RedisStore.js';
export type { KVStore } from './KVStore.js';

export async function createKVStore() {
    const url = process.env['NANGO_REDIS_URL'];
    if (url) {
        const store = new RedisKVStore(url);
        await store.connect();
        return store;
    }

    return new InMemoryKVStore();
}
