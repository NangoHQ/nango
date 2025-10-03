import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InMemoryKVStore, RedisKVStore, destroyAll, getKVStore } from './index.js';
import { getDefaultKVStoreOptions } from './utils.js';

// Mock redis
vi.mock('redis', () => ({
    createClient: vi.fn(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        on: vi.fn()
    }))
}));

describe('getKVStore', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        // Clear environment variables
        delete process.env['NANGO_REDIS_URL'];
        delete process.env['NANGO_REDIS_HOST'];
        delete process.env['NANGO_REDIS_PORT'];
        delete process.env['NANGO_REDIS_AUTH'];

        // Clear the cached kvstorePromise
        await destroyAll(true);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should use RedisKVStore when NANGO_REDIS_URL is provided', async () => {
        process.env['NANGO_REDIS_URL'] = 'redis://localhost:6379';

        const store = await getKVStore(getDefaultKVStoreOptions());

        expect(store).toBeInstanceOf(RedisKVStore);
    });

    it('should use RedisKVStore when endpoint, auth, and port are provided', async () => {
        process.env['NANGO_REDIS_HOST'] = 'localhost';
        process.env['NANGO_REDIS_PORT'] = '6379';
        process.env['NANGO_REDIS_AUTH'] = 'password';

        const store = await getKVStore(getDefaultKVStoreOptions());

        expect(store).toBeInstanceOf(RedisKVStore);
    });
    it('should return InMemoryKVStore when partial Redis config is provided', async () => {
        process.env['NANGO_REDIS_HOST'] = 'localhost';
        const store = await getKVStore(getDefaultKVStoreOptions());

        expect(store).toBeInstanceOf(InMemoryKVStore);
    });
    it('should return InMemoryKVStore when no Redis config is provided', async () => {
        const store = await getKVStore(getDefaultKVStoreOptions());

        expect(store).toBeInstanceOf(InMemoryKVStore);
    });
});
