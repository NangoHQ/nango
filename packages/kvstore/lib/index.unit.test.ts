import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock redis
vi.mock('redis', () => ({
    createClient: vi.fn(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        on: vi.fn()
    }))
}));

// Mock the env module - this needs to be before importing index
const mockEnvs = {
    NANGO_REDIS_URL: undefined as string | undefined,
    NANGO_REDIS_HOST: undefined as string | undefined,
    NANGO_REDIS_PORT: undefined as string | undefined,
    NANGO_REDIS_AUTH: undefined as string | undefined,
    NANGO_CUSTOMER_REDIS_URL: undefined as string | undefined,
    NANGO_CUSTOMER_REDIS_HOST: undefined as string | undefined,
    NANGO_CUSTOMER_REDIS_PORT: undefined as string | undefined,
    NANGO_CUSTOMER_REDIS_AUTH: undefined as string | undefined
};

vi.mock('./env.js', () => ({
    envs: mockEnvs
}));

describe('getKVStore', () => {
    beforeEach(async () => {
        vi.clearAllMocks();

        // Reset all env values to undefined
        mockEnvs.NANGO_REDIS_URL = undefined;
        mockEnvs.NANGO_REDIS_HOST = undefined;
        mockEnvs.NANGO_REDIS_PORT = undefined;
        mockEnvs.NANGO_REDIS_AUTH = undefined;
        mockEnvs.NANGO_CUSTOMER_REDIS_URL = undefined;
        mockEnvs.NANGO_CUSTOMER_REDIS_HOST = undefined;
        mockEnvs.NANGO_CUSTOMER_REDIS_PORT = undefined;
        mockEnvs.NANGO_CUSTOMER_REDIS_AUTH = undefined;

        // Reset modules to ensure fresh state
        vi.resetModules();

        // Clear the cached kvstorePromise
        const { destroy } = await import('./index.js');
        await destroy();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should use RedisKVStore when NANGO_REDIS_URL is provided', async () => {
        mockEnvs.NANGO_REDIS_URL = 'redis://localhost:6379';
        vi.resetModules();

        const { getKVStore, RedisKVStore } = await import('./index.js');
        const store = await getKVStore();

        expect(store).toBeInstanceOf(RedisKVStore);
    });

    it('should use RedisKVStore when endpoint, auth, and port are provided', async () => {
        mockEnvs.NANGO_REDIS_HOST = 'localhost';
        mockEnvs.NANGO_REDIS_PORT = '6379';
        mockEnvs.NANGO_REDIS_AUTH = 'password';
        vi.resetModules();

        const { getKVStore, RedisKVStore } = await import('./index.js');
        const store = await getKVStore();

        expect(store).toBeInstanceOf(RedisKVStore);
    });

    it('should return InMemoryKVStore when partial Redis config is provided', async () => {
        mockEnvs.NANGO_REDIS_HOST = 'localhost';
        vi.resetModules();

        const { getKVStore, InMemoryKVStore } = await import('./index.js');
        const store = await getKVStore();

        expect(store).toBeInstanceOf(InMemoryKVStore);
    });

    it('should return InMemoryKVStore when no Redis config is provided', async () => {
        vi.resetModules();

        const { getKVStore, InMemoryKVStore } = await import('./index.js');
        const store = await getKVStore();

        expect(store).toBeInstanceOf(InMemoryKVStore);
    });

    it('should return an in-memory sliding window limiter when no Redis config is provided', async () => {
        vi.resetModules();

        const { createSlidingWindowRateLimiter, InMemorySlidingWindowRateLimiter } = await import('./index.js');
        const limiter = await createSlidingWindowRateLimiter({ keyPrefix: 'test', limit: 10, windowMs: 1000 });

        expect(limiter).toBeInstanceOf(InMemorySlidingWindowRateLimiter);
        await limiter.destroy();
    });

    it('should return a Redis sliding window limiter when Redis is configured', async () => {
        mockEnvs.NANGO_REDIS_URL = 'redis://localhost:6379';
        vi.resetModules();

        const { createSlidingWindowRateLimiter, RedisSlidingWindowRateLimiter } = await import('./index.js');
        const limiter = await createSlidingWindowRateLimiter({ keyPrefix: 'test', limit: 10, windowMs: 1000 });

        expect(limiter).toBeInstanceOf(RedisSlidingWindowRateLimiter);
        await limiter.destroy();
    });

    it('should cool down Redis connection attempts after a failure', async () => {
        mockEnvs.NANGO_REDIS_URL = 'redis://localhost:6379';
        vi.resetModules();
        const { createClient } = await import('redis');
        const connect = vi.fn().mockRejectedValue(new Error('unavailable'));
        vi.mocked(createClient).mockReturnValueOnce({
            connect,
            disconnect: vi.fn().mockResolvedValue(undefined),
            on: vi.fn(),
            isOpen: false,
            isReady: false
        } as never);

        const { createSlidingWindowRateLimiter } = await import('./index.js');
        const limiter = await createSlidingWindowRateLimiter({ keyPrefix: 'test', limit: 1, windowMs: 1000 });

        await expect(limiter.consume('key', 1)).resolves.toMatchObject({ admitted: 1, rejected: 0 });
        await expect(limiter.consume('key', 1)).resolves.toMatchObject({ admitted: 1, rejected: 0 });
        expect(connect).toHaveBeenCalledTimes(1);
        await limiter.destroy();
    });

    it('should wait for an in-flight Redis connection during destroy', async () => {
        mockEnvs.NANGO_REDIS_URL = 'redis://localhost:6379';
        vi.resetModules();
        const { createClient } = await import('redis');
        let resolveConnection: ((client: unknown) => void) | undefined;
        const connection = new Promise((resolve) => {
            resolveConnection = resolve;
        });
        const disconnect = vi.fn().mockResolvedValue(undefined);
        const redis = {
            connect: vi.fn().mockReturnValue(connection),
            disconnect,
            on: vi.fn(),
            isOpen: true,
            isReady: false
        };
        vi.mocked(createClient).mockReturnValueOnce(redis as never);

        const { createSlidingWindowRateLimiter } = await import('./index.js');
        const limiter = await createSlidingWindowRateLimiter({ keyPrefix: 'test', limit: 1, windowMs: 1000 });
        const consume = limiter.consume('key', 1);
        let destroyCompleted = false;
        const destroy = limiter.destroy().then(() => {
            destroyCompleted = true;
        });

        await Promise.resolve();
        expect(destroyCompleted).toBe(false);
        resolveConnection?.(redis);
        await destroy;
        await expect(consume).resolves.toMatchObject({ admitted: 1, rejected: 0 });
        expect(disconnect).toHaveBeenCalledOnce();
    });

    it('should reject invalid sliding window limiter options asynchronously', async () => {
        vi.resetModules();

        const { createSlidingWindowRateLimiter } = await import('./index.js');

        await expect(createSlidingWindowRateLimiter({ keyPrefix: '', limit: 10, windowMs: 1000 })).rejects.toThrow('keyPrefix must not be empty');
    });

    it('should return different instances for different boundaries', async () => {
        vi.resetModules();

        const { getKVStore } = await import('./index.js');
        const store1 = await getKVStore('system');
        const store2 = await getKVStore('customer');

        expect(store1).not.toBe(store2);
    });
});
